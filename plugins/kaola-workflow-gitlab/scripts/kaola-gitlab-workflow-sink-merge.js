#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitlab-forge');
const { getCoordRoot, readActiveFolders, removeWorktree, worktreePathFor, buildClosureReceipt, checkClosureInvariants, defaultBranch, appendClosureBlock } = require('./kaola-gitlab-workflow-claim');
// #548: the canonical repo-kind discriminator (self-host npm vs consumer). run-chains requires
// no sink-merge symbol, so this is non-circular.
const { resolveChains } = require('./kaola-gitlab-workflow-run-chains');
// Crash-safe durable write (tmp + fsync + rename) for the sink transaction journals. adaptive-schema
// is base-named in ALL four trees (the cross-edition byte anchor), so this literal is not forge-renamed.
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// THE SINK REPORTS; THE ORCHESTRATOR OWNS THE OUTCOME — AND REPORTING MEANS STOPPING. A converted
// site does NOT merge and report; it STOPS WITHOUT MERGING. That is the opposite of a softer
// refusal: stopping leaves every option open (fix and re-run, file a merge request instead, record a
// decision), while merging forecloses all of them. Four properties at every converted site:
//   1. the measurement completes and the finding is recorded DURABLY — a named field on the sink
//      receipt under --sink (the journal survives precisely because the run did not succeed), a
//      typed envelope on the legacy path, which has no journal;
//   2. the sink STOPS, nothing merged and nothing published;
//   3. the exit stays non-success — transport for an output-blind consumer, not a verdict;
//   4. a sanctioned proceed-path is named in the finding's operator_hint.
// A KEEP site loses only property 4: proceeding past a dirty worktree, a failed push or an
// incomplete archive destroys something, so there is no proceed-path to offer.
// Shape follows adaptive-schema's evaluateChainReceipt finding.
const sinkFindings = [];

function recordSinkFinding(classification, detail, operatorHint, payload) {
  const finding = Object.assign({
    classification,
    detail: Array.isArray(detail) ? detail : [String(detail)],
    operator_hint: operatorHint
  }, payload || {});
  sinkFindings.push(finding);
  process.stderr.write('sink-merge: FINDING ' + classification + ': ' + finding.detail.join(' ') + '\n'
    + '  ' + operatorHint + '\n');
  return finding;
}

// Attach the findings to an emitted envelope. Attached ONLY when non-empty, so a run that found
// nothing emits byte-identical output; applied at every emission so a KEEP-class refusal downstream
// of a finding cannot swallow it.
function sinkEmit(payload, exitCode) {
  const out = sinkFindings.length ? Object.assign({}, payload, { findings: sinkFindings }) : payload;
  process.stdout.write(JSON.stringify(out) + '\n');
  if (exitCode != null) process.exitCode = exitCode;
}

// Where the run's record lives, newest-authority first: the recorded archive dest, the plain
// archive, then the live folder. Null when the run has no folder on disk at all.
function resolveRunRecordDir(mainRoot, project, archiveDestRel) {
  const candidates = [];
  if (archiveDestRel) candidates.push(path.join(mainRoot, archiveDestRel));
  candidates.push(path.join(mainRoot, 'kaola-workflow', 'archive', project));
  candidates.push(path.join(mainRoot, 'kaola-workflow', project));
  for (const dir of candidates) {
    try { if (fs.statSync(dir).isDirectory()) return dir; } catch (_) {}
  }
  return null;
}

// The durable half — same file, same presence-guarded / swallow-on-error discipline as the
// `## Validation`, `## Changed Paths` and `## Attestation` sections the finalize report writes
// there. Returns the absolute path written, or null when there was nothing to write.
function persistSinkFindingsToSummary(destDir, postRebaseTests) {
  if (!destDir) return null;
  if (!sinkFindings.length && !postRebaseTests) return null;
  try {
    const p = path.join(destDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { /* create-if-absent */ }
    if (/^## Sink Findings$/m.test(s)) return null; // idempotent across a crash-resumed re-entry
    const lines = ['## Sink Findings', ''];
    if (postRebaseTests) lines.push('post_rebase_tests: ' + postRebaseTests, '');
    for (const f of sinkFindings) {
      lines.push('classification: ' + f.classification);
      for (const d of f.detail || []) lines.push('', d);
      if (f.operator_hint) lines.push('', f.operator_hint);
      lines.push('');
    }
    const block = lines.join('\n').trimEnd() + '\n';
    fs.mkdirSync(destDir, { recursive: true });
    adaptiveSchema.writeFileAtomicReplace(p, s ? (s.trimEnd() + '\n\n' + block) : block);
    return p;
  } catch (_) { return null; }
}

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

// The repo-relative paths currently STAGED under one pathspec. Read from the INDEX, not the working
// tree and not the caller's own list of what it believed it planted — that is what stops the #893
// report under-claiming a file that rode in unnoticed, or over-claiming one this sink never touched.
//
// `-z`, and split on NUL and NOTHING ELSE — the fourth site of the same normalization, kept identical
// to the three below. This list is not diagnostic: persistArchivedPathsToSummary writes it DURABLY
// into the archive, so a name it mangles is a false statement in the run's own permanent record. The
// plain `--name-only` stream C-quotes an embedded newline and emits a trailing space RAW (measured
// with `od -c`), so the `.trim()` here reported a file really named `notes.md ` as `.cache/notes.md` —
// a path that exists nowhere — and left the quoted form of the others in the archive verbatim.
function stagedPathsUnder(mainRoot, pathspec, excludes) {
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--name-only', '-z', '--', pathspec, ...(excludes || [])], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch (_) { return []; }
}

// #893's durable half. The sink commits its whole own-archive pathspec and cannot tell a file
// finalize mirrored from one nobody wrote — the archive copies a folder that lives untracked in main
// and is committed nowhere, so git holds no record of what belongs, and no list of names could stand
// in for one when archives carry whatever artifacts a run happened to need. The harm closed is
// SILENCE, not the commit: every own-archive path that lands is NAMED, uniformly, and the
// orchestrator adjudicates. This is the half that outlives the process (the envelope is stdout, the
// journal is disposed on success). Shares `## Sink Findings`, adding that header only when the
// findings writer did not. NEVER creates the summary — a report that invented a file inside the
// archive would add the very kind of unaccounted path it exists to disclose, and appending to a file
// the add already swept cannot shift the set it just reported. Swallow-on-error like every
// measurement writer here: it must not be able to fail the operation it reports on. True iff written.
function persistArchivedPathsToSummary(destDir, archivedPaths) {
  if (!destDir || !archivedPaths || !archivedPaths.length) return false;
  try {
    const p = path.join(destDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { return false; } // absent → never fabricate one
    if (/^archived_paths:$/m.test(s)) return false; // idempotent across a crash-resumed re-entry
    const lines = [];
    if (!/^## Sink Findings$/m.test(s)) lines.push('## Sink Findings', '');
    lines.push('archived_paths:');
    for (const rel of archivedPaths) lines.push('- ' + rel);
    adaptiveSchema.writeFileAtomicReplace(p, s.trimEnd() + '\n\n' + lines.join('\n').trimEnd() + '\n');
    return true;
  } catch (_) { return false; }
}

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

// #396.5: returns true iff issue N is already CLOSED on the forge (classify a close that exited as a
// failure during an idempotent re-run). Any probe error returns false (fail toward 'failed').
function probeIssueClosed(issueNumber, opts) {
  if (OFFLINE || issueNumber == null) return false;
  try {
    const st = forge.viewIssue(issueNumber, opts || {});
    return String((st && st.state) || '').toLowerCase() === 'closed';
  } catch (_) { return false; }
}

// #517/#694: reopen issue N on the forge. The single forge-noun site for reopen — used by the
// push_main #517 auto-close reopen AND the #694 keep-open END-STATE guard. Throws on failure so the
// caller can distinguish a confirmed reopen from a failed one.
function reopenIssue(issueNumber, opts) {
  if (OFFLINE || issueNumber == null) return;
  forge.glabExec(['issue', 'reopen', String(issueNumber)], opts || {});
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
  return {
    project_id: Number(field(content, 'project_id')) || null,
    path_with_namespace: field(content, 'path_with_namespace'),
    web_url: field(content, 'project_web_url')
  };
}

function finalValidationPassed(root, project) {
  const summaryFile = resolveProjectFile(root, project, 'finalization-summary.md');
  let summary = '';
  try { summary = fs.readFileSync(summaryFile, 'utf8'); } catch (_) { return false; }
  return /Final Validation/i.test(summary) && /pass/i.test(summary) && !/blocked|failed/i.test(summary);
}

function assertCleanWorktree(gitExec) {
  const status = gitExec('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }).trim();
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
  // CONVERTED: whether an unfinalized run folder should block publication judges the state of the
  // work, not a destruction risk. The sink still STOPS — publishing a branch whose run never
  // finalized would commit live run state onto the mainline — but the answer is now typed, durable
  // and carries the two remediations that have always existed. Returns the finding, or null.
  if (!committed) return null;
  return recordSinkFinding(
    'run_not_finalized',
    ['kaola-workflow/' + project + '/workflow-state.md still exists on branch ' + (branch || 'HEAD')
      + ' — this run was never finalized, so the branch still carries live run state. '
      + 'Nothing was merged and nothing was pushed.'],
    'Run finalize before sink-merge, then recommit. Two remediations, either of which lets '
      + 'the sink resume unchanged. '
      + 'Path A (worktree available): cd <worktree> && node <claim.js> finalize --project ' + project
      + ' --keep-worktree, then git add kaola-workflow/ && git commit -m "chore: archive ' + project
      + '" on the feature branch. Path B (worktree gone): git rm -r kaola-workflow/' + project
      + '/ on the feature branch, commit, then re-run sink-merge.',
    { project, branch: branch || null, live_state_path: gitPath });
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

// Does this branch carry any implementation beyond kaola-workflow/** bookkeeping?
//
// CONVERTED: this was a refusal, and "the work does not count" is a judgement about the work — the
// class that is now the orchestrator's call. A docs-only or roadmap-only branch is a legitimate
// deliverable. The measurement is untouched (same diff, same all-under-kaola-workflow/ test, same
// skip when the base is unresolvable); only the verdict is gone. Returns the recorded finding, or
// null. The name is the stable exported symbol and is retained deliberately.
function assertBranchHasNonWorkflowChanges(mainRoot, branch, defBranch) {
  const baseRef = 'origin/' + defBranch;
  let base;
  try {
    base = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--verify', baseRef],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return null; } // origin/main missing → skip (same posture as merge-base skip-check)
  let files;
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'diff', '--name-only', base + '...' + branch],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
    files = out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (_) { return null; } // diff failed → do not fabricate a finding
  if (files.length === 0) return null; // no changes at all — leave to the existing up-to-date / FF logic
  const allWorkflow = files.every(f => f.startsWith('kaola-workflow/'));
  if (!allWorkflow) return null;
  return recordSinkFinding(
    'no_implementation_changes',
    ['branch ' + branch + ' carries no implementation changes beyond ' + baseRef
      + ' — every changed file is a kaola-workflow/** workflow artifact: ' + files.join(', ')
      + '. Nothing was merged and nothing was pushed.'],
    'If the branch was meant to deliver implementation, its final commit is missing: add the real '
      + 'changed files and re-run the sink. If it is deliberately a docs/roadmap-only change, that '
      + 'is a legitimate deliverable and the route for it is a merge request — run sink-pr for this '
      + 'branch, which stages the content for review rather than publishing it.',
    { branch, base_ref: baseRef, workflow_only_files: files });
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

// #397.4: fastForwardMain is reached ONLY from the legacy `runDirectMerge({skipGit})` test path here
// (the live merge path is the default-branch-resolved ffMergeLoop). Canonical has zero hardcoded
// 'main'/'origin/main' literals post-#350; this port's hardcoded literals are removed too — the
// default branch is resolved (opts.defBranch, falling back to defaultBranch). Under skipGit the
// gitExec is a stub so the resolution is mocked, but the literals no longer drift from canonical.
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

// #350: post-rebase validation MEASUREMENT (skipped OFFLINE / under the test-gate-skip hook).
//
// CONVERTED: this ran `npm test` and threw on red, killing the sink at the publication door. It is
// the witness verdict on the work, and that verdict belongs to the orchestrator. The suite still
// RUNS over the same tree with the same exit code read; a red result is reported as a `chains_red`
// finding and the sink proceeds. Returns the finding, or null when green / not runnable.
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
  if (OFFLINE || SKIP_TESTGATE) return { result: 'skipped', finding: null };
  let pkgRoot = mainRoot;
  try { pkgRoot = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() || mainRoot; } catch (_) { pkgRoot = mainRoot; }
  const res = resolveChains(pkgRoot);
  if (res && res.error) return { result: 'skipped', finding: null }; // consumer repo — no chains.
  try {
    execFileSync('npm', ['test'], { cwd: mainRoot, encoding: 'utf8', stdio: 'inherit' });
  } catch (e) {
    const exitCode = (e && e.status) != null ? e.status : null;
    return {
      result: 'red',
      finding: recordSinkFinding(
        'chains_red',
        ['`npm test` exited ' + (exitCode != null ? exitCode : 'non-zero')
          + ' over the rebased tree at ' + mainRoot
          + ' — this repo\'s own chains are RED on the content that would be published. '
          + 'Nothing was merged and nothing was pushed.'],
        'Two ways forward, both sanctioned: fix the red chains and re-run the sink, which resumes '
          + 'where it stopped; or run sink-pr for this branch instead, staging the content for '
          + 'review rather than publishing it. The branch is untouched either way.',
        { npm_test_exit_code: exitCode })
    };
  }
  return { result: 'green', finding: null };
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
        // #397.2: post-rebase push must be force-with-lease (a plain push is rejected non-fast-forward
        // if attempt 1 already pushed a pre-rebase tip); Step 0 already removed the linked worktree.
        '  4. Push the rebased branch: git push --force-with-lease origin ' + args.branch + '\n' +
        '  5. Re-invoke sink-merge after conflicts are resolved\n' +
        '  Note: Step 0 already removed the linked worktree (often your cwd); resolve in ' + mainRoot + '.'
      );
    }
    return runTestGate(mainRoot);
  }
  // No rebase, so no post-rebase measurement exists. This has always been the common case — the
  // gate only ever ran when the base had moved — so "a red suite blocks the merge" was never true
  // of a sink whose branch was already on top of the default branch.
  return { result: 'skipped', finding: null };
}

// Returns { merged, reason, testGate } naming WHICH way the loop ended — three distinct classes:
//   'non_fast_forward' — the fast-forward kept failing. Not a CONVERT: nothing about the work was
//     judged. It still STOPS with a non-success exit, and still emits a TYPED envelope, because an
//     output-blind consumer cannot act on a bare exit code — and its resolutions are real.
//   'rebase_conflict'  — a real content conflict re-rebasing onto the advanced base. Stops bare.
//   'chains_red'       — the re-taken post-rebase measurement came back red. CONVERTED, and it
//     surfaces under its OWN name: this arm used to return false into giveUp, which then printed
//     "FF race: exhausted retries" — a red suite reported as a merge race.
function ffMergeLoop(args, mainRoot, defBranch) {
  let retries = 0;
  let forcedFailCount = 0;
  let testGate = { result: 'skipped', finding: null };
  const giveUp = (reason) => {
    // Only the genuine race prints the race message. A converted stop names what it found.
    if (reason !== 'chains_red') {
      process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
    }
    try { execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' }); } catch (_) {}
    return { merged: false, reason, testGate };
  };
  // #350: re-fetch + re-rebase the feature branch onto the updated origin tip before retrying — the
  // only race that makes an FF fail is origin/<defBranch> advancing after the initial rebase, and
  // the pre-#350 loop retried the IDENTICAL ff-only merge without re-rebasing (dead weight).
  // Returns a reason string when the loop must end, or null to keep going.
  const reRebaseFeature = () => {
    if (OFFLINE) return null;
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
      return 'rebase_conflict';
    }
    // The base moved, so the witness is re-taken over the new content. Red ends the loop under its
    // own name — never laundered into the race message above.
    testGate = runTestGate(mainRoot);
    return testGate.result === 'red' ? 'chains_red' : null;
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
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp('non_fast_forward');
      const endReason = reRebaseFeature();
      if (endReason) return giveUp(endReason);
      continue;
    }
    try {
      execFileSync('git', ['-C', mainRoot, 'merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
      return { merged: true, testGate };
    } catch (_) {
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp('non_fast_forward');
      const endReason = reRebaseFeature();
      if (endReason) return giveUp(endReason);
    }
  }
}

function postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch, postRebaseTests) {
  // #617: capture the feature branch's commit SHA now, before Step 9 below deletes the branch
  // ref — this is "the recorded implementation commit" the remote-closed-after-publish invariant
  // (wired into checkClosureInvariants below) verifies is an ancestor of defBranch before the
  // receipt is allowed to report a genuine close.
  let implCommitSha = null;
  try {
    implCommitSha = execFileSync('git', ['-C', mainRoot, 'rev-parse', args.branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {}
  // The durable half of the report on THIS path, which has no step journal to carry it. Written AND
  // committed BEFORE the push below, so the same push publishes the finding and the sink does not
  // leave the default branch dirty. No findings → no file, no commit: a run that found nothing is
  // byte-unchanged.
  const recordable = postRebaseTests && postRebaseTests !== 'skipped' ? postRebaseTests : null;
  if (recordable || sinkFindings.length) {
    const findingsPath = persistSinkFindingsToSummary(
      resolveRunRecordDir(mainRoot, args.project, null), recordable);
    if (findingsPath) {
      const rel = path.relative(mainRoot, findingsPath).split(path.sep).join('/');
      try {
        execFileSync('git', ['-C', mainRoot, 'add', '--', rel], { encoding: 'utf8' });
        execFileSync('git', ['-C', mainRoot, 'commit', '-m', 'chore: record sink findings for ' + args.project, '--', rel], { encoding: 'utf8' });
      } catch (_) { /* best-effort: the finding is on disk and on the envelope either way */ }
    }
  }
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
    // #394: the STANDARD lane archives the project BEFORE sink-merge runs, so the LIVE .cache is gone.
    // Write the fallback receipt to the ARCHIVE .cache when archived (was "skipping receipt write" →
    // the broken exit-3 chain); keep the live .cache write when the folder is still live.
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
    // Atomic (tmp + fsync + rename): this is a crash-resume journal whose payload — the resolved
    // default branch and the full issue member set — CANNOT be re-derived once the live folder has
    // been archived. A torn receipt breaks the exit-3 fallback chain with nothing to recover from.
    adaptiveSchema.writeFileAtomicReplace(receiptPath, JSON.stringify({
      project: args.project,
      branch: args.branch,
      issue_number: args.issue != null ? args.issue : null,
      // #394: the fallback sink (sink-mr) needs the resolved default branch + full member set.
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

  // Step 8 — Close issue (GitLab-specific: forge API) — or, on a keep-open run, note WITHOUT closing
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
    const root = mainRoot; // mainRoot is used as root context
    const forgeOpts = { execOptions: { cwd: mainRoot } };
    if (keepIssueOpen) {
      // #336: mechanical keep-open note. Body contains no close/fix/resolve #N substring.
      try { forge.createIssueNote(readProjectInfo(root, args.project), args.issue, 'Merged via GitLab direct merge sink. Issue intentionally kept open (partial-close terminal); residual scope remains tracked here.', forgeOpts); } catch (_) {}
    } else {
      // #427: probe before attempting close — if cmdFinalize already closed the issue, skip the
      // close call entirely (avoids a guaranteed exit-1 error in the normal finalize→sink flow).
      if (probeIssueClosed(args.issue, forgeOpts)) {
        remoteIssueClosed = 'already_closed';
        process.stderr.write('sink-merge: Issue #' + args.issue + ' already closed by cmdFinalize, skipping close.\n');
      } else {
        try { forge.createIssueNote(readProjectInfo(root, args.project), args.issue, 'Merged via GitLab direct merge sink.', forgeOpts); } catch (_) {}
        try {
          forge.closeIssue(args.issue, forgeOpts);
          // #619(2): a close call exiting without error does not PROVE the issue is closed (a rare
          // forge/API race can leave it open) — the old code trusted it unconditionally and only
          // probed in the catch branch below. Probe the live state on the success path too.
          if (probeIssueClosed(args.issue, forgeOpts)) { remoteIssueClosed = 'closed'; }
          else {
            remoteIssueClosed = 'failed';
            process.stderr.write('sink-merge: WARNING: issue close reported success for ' + args.issue + ' but the issue is still OPEN; receipt.remote_issue_closed=failed. Manually run: glab issue close ' + args.issue + '\n');
          }
        }
        catch (e) {
          // #396.5: a close that exits as failure on an ALREADY-CLOSED issue (idempotent re-run) is a
          // SUCCESS — probe before declaring failure.
          if (probeIssueClosed(args.issue, forgeOpts)) { remoteIssueClosed = 'already_closed'; }
          else { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: glab issue close ' + args.issue + '\n'); }
        }
      }
    }
    // Claim-label removal runs in BOTH modes (claim release is wanted on keep-open).
    try { forge.updateIssue(args.issue, Object.assign({ unlabels: [forge.CLAIM_LABEL] }, forgeOpts)); claimLabelRemoved = 'removed'; } catch (_) { claimLabelRemoved = 'failed'; }

    // #403.6: keep-open BUNDLE arm — per-member note + label removal (the close loop is gated
    // !keepIssueOpen, so non-primary keep-open members otherwise got nothing).
    if (keepIssueOpen && Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
      for (const n of args.issueNumbers) {
        if (n === args.issue) continue;
        try { forge.createIssueNote(readProjectInfo(root, args.project), n, 'Merged via GitLab direct merge sink (bundle member). Issue intentionally kept open (partial-close terminal); residual scope remains tracked here.', forgeOpts); } catch (_) {}
        try { forge.updateIssue(n, Object.assign({ unlabels: [forge.CLAIM_LABEL] }, forgeOpts)); } catch (_) {}
      }
    }
  }

  // #369 BUNDLE all-or-nothing closure: close EVERY member of issue_numbers, not just the primary.
  // Gated on a real bundle (length > 1) so single-issue output is byte-unchanged (AC7). Each member
  // lands in exactly ONE bucket (no silent-neither): closed_issues or failed_issue_closures.
  let bundleBuckets = null;
  if (!OFFLINE && !keepIssueOpen && Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
    const forgeOpts = { execOptions: { cwd: mainRoot } };
    const closed = [], failed = [];
    if (args.issue != null) {
      if (remoteIssueClosed === 'closed' || remoteIssueClosed === 'already_closed') closed.push(args.issue);
      else failed.push(args.issue);
    }
    for (const n of args.issueNumbers) {
      if (n === args.issue) continue; // primary handled above
      try {
        forge.createIssueNote(readProjectInfo(mainRoot, args.project), n, 'Merged via GitLab direct merge sink (bundle member).', forgeOpts);
        forge.closeIssue(n, forgeOpts);
        // #619(2): probe the live state on the success path too — a non-throwing close is not proof.
        if (probeIssueClosed(n, forgeOpts)) {
          closed.push(n);
          try { forge.updateIssue(n, Object.assign({ unlabels: [forge.CLAIM_LABEL] }, forgeOpts)); } catch (_) {}
        } else {
          failed.push(n);
          process.stderr.write('sink-merge: WARNING: bundle member issue close reported success for ' + n + ' but the issue is still OPEN; recorded in failed_issue_closures.\n');
        }
      } catch (e) {
        // #396.5: classify already-closed (idempotent re-run) as SUCCESS, not a failed closure.
        if (probeIssueClosed(n, forgeOpts)) {
          closed.push(n);
          try { forge.updateIssue(n, Object.assign({ unlabels: [forge.CLAIM_LABEL] }, forgeOpts)); } catch (_) {}
        } else {
          failed.push(n);
          process.stderr.write('sink-merge: WARNING: bundle member issue close failed for ' + n + '; recorded in failed_issue_closures. Manually run: glab issue close ' + n + '\n');
        }
      }
    }
    bundleBuckets = { closed_issues: closed.sort((a, b) => a - b), failed_issue_closures: failed.sort((a, b) => a - b), open_issues: [] };
    remoteIssueClosed = failed.length === 0 ? 'closed' : 'partial';
  }
  // Step 9 — Delete branch
  // #397.1: delete the REMOTE branch first, then verify the local branch is merged into defBranch and
  // force-delete with -D (the post-race-recovery local branch diverges from upstream → plain `-d`
  // refuses on EVERY successful race recovery, leaving branch_removed:'failed' + a spurious violation).
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
  // The dispatch-attestation probe is gone with the mechanism it read: claim.js no longer exports
  // checkDispatchAttestations. Calling a retired export was not a stale comment — it threw AFTER the
  // merge had landed, so the sink advanced the default branch and then died reporting exit 1.
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
        'completed sink. Manually close the issue(s) (`glab issue close <N>`), then reconcile state.',
    };
    if (bundleBuckets) {
      out.closed_issues = bundleBuckets.closed_issues;
      out.failed_issue_closures = bundleBuckets.failed_issue_closures;
    }
    sinkEmit(out);
    return { exitCode: 1 };
  }

  // #393a: surface the member-set source.
  const emit = { status: 'merged', closure_receipt: receipt, closure_invariants: invariants };
  if (args.member_source) emit.member_source = args.member_source;
  sinkEmit(emit);
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
    // Legacy path (existing tests use this)
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
    // (sink-fallback → sink-mr) has a home. The old early-exit returned exit 3 with NO receipt,
    // breaking the chain on a project that finalize already archived (the STANDARD lane).
    try {
      const receiptPath = path.join(_archiveDir, '.cache', 'sink-fallback.json');
      fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
      // Atomic (tmp + fsync + rename): same crash-resume journal, same un-re-derivable payload.
      adaptiveSchema.writeFileAtomicReplace(receiptPath, JSON.stringify({
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
  const status = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }).trim();
  assert(!status, 'Worktree must be clean before direct merge sink runs');
  const liveFolderFinding = assertNoLiveWorkflowFolder(mainRoot, args.project, args.branch);
  if (liveFolderFinding) {
    sinkEmit({
      result: 'report', status: 'not_merged', reason: 'run_not_finalized',
      branch: args.branch, project: args.project,
      detail: liveFolderFinding.detail[0],
    }, 1);
    return { exitCode: 1 };
  }
  if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);
  if (!OFFLINE) {
    const emptyBranchFinding = assertBranchHasNonWorkflowChanges(mainRoot, args.branch, defBranch);
    if (emptyBranchFinding) {
      sinkEmit({
        result: 'report', status: 'not_merged', reason: 'no_implementation_changes',
        branch: args.branch, default_branch: defBranch,
        workflow_only_files: emptyBranchFinding.workflow_only_files,
        detail: emptyBranchFinding.detail[0],
      }, 1);
      return { exitCode: 1 };
    }
  }
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

  // The post-rebase measurement, taken before the fast-forward so a red result stops with nothing
  // merged. This path has no step journal, so the typed envelope is the durable record.
  let testGate = doRebase(args, alreadyUpToDate, mainRoot, defBranch);
  if (testGate.result === 'red') {
    sinkEmit({
      result: 'report', status: 'not_merged', reason: 'chains_red', post_rebase_tests: 'red',
      branch: args.branch, default_branch: defBranch,
      detail: 'the post-rebase chains are RED over ' + args.branch + '. Nothing was merged into '
        + defBranch + ', nothing was pushed, and no issue was closed.',
    }, 1);
    return { exitCode: 1 };
  }

  const ffOutcome = ffMergeLoop(args, mainRoot, defBranch);
  if (ffOutcome.testGate && ffOutcome.testGate.result !== 'skipped') testGate = ffOutcome.testGate;
  if (!ffOutcome.merged) {
    // chains_red is the CONVERTED arm and surfaces under its own name — it used to be laundered
    // into giveUp's "FF race: exhausted retries", reporting a red suite as a merge race.
    if (ffOutcome.reason === 'chains_red') {
      sinkEmit({
        result: 'report', status: 'not_merged', reason: 'chains_red', post_rebase_tests: 'red',
        branch: args.branch, default_branch: defBranch,
        detail: 'the chains went RED on the re-rebased tree during fast-forward recovery. This is a '
          + 'red suite, NOT a merge race. Nothing was merged or pushed.',
      }, 1);
      return { exitCode: 1 };
    }
    if (ffOutcome.reason === 'non_fast_forward') {
      sinkEmit({
        result: 'report', status: 'not_merged', reason: 'non_fast_forward',
        branch: args.branch, default_branch: defBranch,
        detail: 'branch ' + args.branch + ' did not fast-forward onto ' + defBranch + ' after '
          + MAX_AUTOMERGE_RETRIES + ' attempts. Nothing was merged, nothing was pushed and no issue was '
          + 'closed. Rebase onto the updated ' + defBranch + ' and re-run the sink, resynchronize and '
          + 're-run, or run sink-pr instead.',
      }, 2);
      return { exitCode: 2 };
    }
    // rebase_conflict stops bare: a true content conflict is never auto-resolved.
    return { exitCode: 2 };
  }

  const cleanupResult = postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch, testGate.result);
  // #619(1): postMergeCleanup can now also return { exitCode: 1 } (a failed-close sink_incomplete
  // refusal) alongside the pre-existing { exitCode: 3 } (merge-impossible fallback) — generalize
  // from the exact-3 check to any returned exitCode.
  if (cleanupResult && cleanupResult.exitCode) {
    return { exitCode: cleanupResult.exitCode };
  }

  return { merged: true };
}

// ---------------------------------------------------------------------------
// #429: --sink transaction — resumable step-receipt based merge pipeline (GitLab port)
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

// #746: the finalize step fails LOUDLY on any incomplete archive. It used to also carry an
// allowlist of one benign `snapshot_error` ('state_missing' on a journal-only live dir); that
// field had exactly one producer, the epoch/authority preflight, and nothing sets it any more —
// the benign shape now simply reports a complete archive and is skipped without a special case.

// Routed through the shared primitive so the step journal gets the fsync + parent-dir fsync the
// local temp+rename lacked — without it the rename can settle while the bytes are still only in the
// page cache, which is exactly the crash this journal exists to survive.
function writeSinkReceipt(receiptPath, receipt) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  adaptiveSchema.writeFileAtomicReplace(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
}

function resolveSinkReceiptPath(mainRoot, project) {
  const live = path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json');
  const archive = path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json');
  if (fs.existsSync(live)) return live;
  if (fs.existsSync(archive)) return archive;
  // A collision-suffixed archive (archive/<project>.archived-<ts>/) may hold the receipt: the
  // finalize step follows archiveProjectDir's actual dest, so a crash-resume must scan the suffixed
  // candidates too (newest suffix first — the suffix is a sortable timestamp).
  try {
    const archiveRoot = path.join(mainRoot, 'kaola-workflow', 'archive');
    const suffixed = fs.readdirSync(archiveRoot)
      .filter(name => name.startsWith(project + '.archived-')).sort().reverse();
    for (const name of suffixed) {
      const candidate = path.join(archiveRoot, name, '.cache', 'sink-receipt.json');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_) {}
  const liveDir = path.join(mainRoot, 'kaola-workflow', project);
  if (fs.existsSync(liveDir)) return live;
  return archive;
}

// #653: dispose the sink-receipt.json / sink-fallback.json transaction journals at TERMINAL
// SUCCESS — they exist on disk only for crash-resume, never as tracked or lingering debris.
// Per-file try/catch: a failed unlink must never fail an otherwise-successful sink. Returns true
// iff no candidate journal remains on disk afterward.
function disposeSinkJournals(mainRoot, project, archiveDestRel) {
  const candidates = [
    path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json'),
    path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-fallback.json'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-fallback.json'),
  ];
  // #700/#694: the collision-suffixed archive dest (archive/<project>.archived-<ts>/) escapes the
  // four plain candidates — add the recorded dest AND sweep EVERY suffixed archive so a prior cycle's
  // residual receipt is disposed too (shared root cause with #694's stale cross-run resume).
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
    try { fs.unlinkSync(p); } catch (e) {
      if (e && e.code === 'ENOENT') continue;
      allDisposed = false;
      process.stderr.write('sink-merge --sink: WARNING: failed to dispose sink journal ' + p + ': ' + (e.message || String(e)) + '\n');
    }
  }
  // #832: resolveSinkReceiptPath's last fallback returns the ARCHIVE receipt path when main holds
  // no live folder, and writeSinkReceipt mkdir -p's it — so the sink itself manufactures a bare
  // `kaola-workflow/archive/<project>/.cache/` skeleton. That is precisely the residue the incident
  // left on main, and an existence-only audit read it as a satisfactory archive. Prune it once the
  // journals are gone. Fail-soft and tightly scoped: a folder holding ANYTHING besides an empty
  // .cache/ is a real archive and is never touched, and a prune failure never affects the sink.
  pruneSinkArchiveSkeleton(mainRoot, project);
  return allDisposed;
}

// #832: remove an archive folder the sink's own journal writer created and nothing else ever filled.
// Returns true only when the skeleton was actually removed.
function pruneSinkArchiveSkeleton(mainRoot, project) {
  const dir = path.join(mainRoot, 'kaola-workflow', 'archive', project);
  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 1 && entries[0] === '.cache') {
      if (fs.readdirSync(path.join(dir, '.cache')).length > 0) return false;
      fs.rmdirSync(path.join(dir, '.cache'));
    } else if (entries.length !== 0) {
      return false;
    }
    fs.rmdirSync(dir);
    return true;
  } catch (_) { return false; }
}

// #694: read the CURRENT run's claim_ts from workflow-state.md (## Sink block). A project name is
// stable across runs, so a later run can re-claim the SAME project; the newest claim_ts across every
// state location is the current run's. Scans the branch ref first (at --sink time the current run's
// state lives on the feature branch), then the working-tree live/plain/suffixed archives. Returns the
// newest ISO claim_ts (ISO-8601 sorts lexicographically) or null.
function readCurrentClaimTs(mainRoot, project, branch) {
  if (!isSafeName(project)) return null;
  const stamps = [];
  const collect = (raw) => {
    if (!raw) return;
    const m = raw.match(/^claim_ts:\s*(.+?)\s*$/m);
    if (m && m[1].trim()) stamps.push(m[1].trim());
  };
  if (branch) {
    for (const rel of ['kaola-workflow/' + project + '/workflow-state.md', 'kaola-workflow/archive/' + project + '/workflow-state.md']) {
      try { collect(execFileSync('git', ['-C', mainRoot, 'show', branch + ':' + rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch (_) {}
    }
  }
  const wtFiles = [
    path.join(mainRoot, 'kaola-workflow', project, 'workflow-state.md'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, 'workflow-state.md'),
  ];
  try {
    const archiveBase = path.join(mainRoot, 'kaola-workflow', 'archive');
    for (const entry of fs.readdirSync(archiveBase)) {
      if (entry.startsWith(project + '.archived-')) wtFiles.push(path.join(archiveBase, entry, 'workflow-state.md'));
    }
  } catch (_) {}
  for (const f of wtFiles) { try { collect(fs.readFileSync(f, 'utf8')); } catch (_) {} }
  let newest = null;
  for (const ts of stamps) if (!newest || ts > newest) newest = ts;
  return newest;
}

// #518: cycle-identity guard — stamp branch_head at init; on resume, if steps.merge is 'done'
// and branch_head diverges from the current tip (new cycle, same branch name reused), reinitialize
// all steps to pending so the merge actually runs. Genuine mid-cycle resumes (branch_head matches
// current tip) are NOT disturbed.
// #694: cross-run staleness guard — a receipt whose claim_ts predates the current run's claim_ts
// belongs to an earlier run of the same reused project; reinitialize so the pipeline re-runs fresh
// under THIS run's flags (its recorded steps, including a prior closure:done, are NOT replayed).
function loadOrInitReceipt(mainRoot, project, branch, issueNumber, issueNumbers, defBranch, keepIssueOpen) {
  const receiptPath = resolveSinkReceiptPath(mainRoot, project);
  const currentClaimTs = readCurrentClaimTs(mainRoot, project, branch);
  const resolveBranchHead = () => {
    try { return execFileSync('git', ['-C', mainRoot, 'rev-parse', branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { return null; }
  };
  // DRY fresh-receipt builder — one shape for the no-receipt init, the #518 cycle-identity reinit,
  // and the #694 cross-run reinit. Always stamps keep_open_requested + claim_ts so a later resume can
  // detect BOTH a keep-open flag flip and a cross-run resume.
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
      started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      // #893: archived_paths ships present-and-EMPTY from the start, as removed_duplicates does — a
      // consumer that must tell "committed nothing under the archive" from "this sink does not
      // report" cannot rely on a field that is sometimes absent.
      stash_ref: null, removed_duplicates: [], archived_paths: [],
      steps
    }, extra || {});
  };
  if (fs.existsSync(receiptPath)) {
    try {
      const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (r && r.steps) {
        // #694: cross-run staleness FIRST. A receipt whose recorded claim_ts (or started_at, for a
        // pre-#694 shape) PREDATES the current run's claim_ts is from an earlier run — reinitialize.
        // newCycle:true defers the first disk write past the merge checkout.
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

function sinkCopyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) sinkCopyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// #707: land the staged worktree project copy per-FILE (union) instead of all-or-nothing. A file
// the checkout already placed at the destination (branch-tracked content) is authoritative and is
// NEVER overwritten; a file that exists ONLY in the staged worktree copy — untracked per-node
// .cache/<node-id>.md evidence, crash-resume journals, timings — lands, so the finalize step
// archives the run's REAL evidence. The old guard (`if (!fs.existsSync(mainProjDir))`) discarded
// the ENTIRE stage whenever the live folder existed at all; on every worktree-postured run the
// branch/planner-era main copy exists, so the worktree's node evidence was silently dropped and
// archives landed evidence-empty. Sink journals never land — they are cycle-local scratch that
// must not shadow the receipt path this transaction already resolved (#520 keeps them out of
// commits regardless).
const SINK_STAGE_SKIP = new Set(['sink-receipt.json', 'sink-fallback.json']);
function sinkLandStagedUnion(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SINK_STAGE_SKIP.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) { sinkLandStagedUnion(s, d); continue; }
    if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}

// #901: every regular file the archive holds ON DISK, repo-relative POSIX, minus the #520
// transaction journals (SINK_STAGE_SKIP names exactly those two by basename — the only archive
// content that must never be committed). This is the set the archive commit OWES, and the disk is
// the only authority available: the archive is a copy of a folder that lived untracked in main, so
// git holds no record of what belongs and no list of names could stand in for one when archives
// carry whatever artifacts a run happened to need (the same reason archived_paths is index-derived).
// A SYMLINK is required like any other entry. It was skipped here on the claim that it "does not
// become a blob under the archive path" — measurably false: `git add -f -- <link>` exits 0 and stages
// it as `120000 <sha>`, a blob whose content is the target string, and `ls-tree -r` names it. The
// exclusion is what let a gitignored symlink read `archive_commit:"done"` at exit 0 while a fresh
// clone did not hold it. Anything named `.git` IS skipped, at any type: git silently declines to
// stage a path under a `.git` component (`add -f -- e/.git` exits 0 and indexes nothing), so
// requiring one could only produce a refusal no re-run can clear. Never throws: an unreadable
// subtree contributes nothing rather than aborting the sink.
function requiredArchiveFiles(mainRoot, archiveRel) {
  const out = [];
  const walk = (absDir, relDir) => {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const rel = relDir + '/' + entry.name;
      if (entry.isDirectory()) { walk(path.join(absDir, entry.name), rel); continue; }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (SINK_STAGE_SKIP.has(entry.name)) continue;
      out.push(rel);
    }
  };
  walk(path.join(mainRoot, archiveRel), archiveRel);
  return out.sort();
}

// #901: the paths under `pathspec` that git would REFUSE to stage — untracked AND covered by an
// ignore rule. This is the granularity a directory probe cannot reach: a consumer's basename rule
// `.cache/` leaves the archive DIRECTORY un-ignored (measured: `check-ignore` exits 1) while
// covering every evidence file beneath it. `-o -i --exclude-standard` answers per FILE and is
// index-aware, so an already-tracked path is correctly absent — it needs no `-f`. `-z` so a
// pathname is never quoted or split. Any probe fault yields the empty set: an unprobeable repo must
// not manufacture a force-add.
//
// The stream is split on NUL and NOTHING ELSE. A `.trim()` here undid the very thing `-z` was chosen
// for: `notes.md ` (one trailing space) came back as `notes.md`, matched nothing requiredArchiveFiles
// produced from `readdirSync`, so the file was never force-added — and then the blob gate refused over
// its own omission, identically on every re-run, bricking the sink from a filename. Measured with
// `od -c`: the stream is purely NUL-TERMINATED with no trailing newline, so dropping empty records is
// the only normalization it needs. Byte-identical in blobPathsUnder below and in claim.js's
// ignoredArchiveEvidence — a divergence between the three is a future bug.
function ignoredUntrackedUnder(mainRoot, pathspec) {
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'ls-files', '-o', '-i', '--exclude-standard', '-z', '--', pathspec],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch (_) { return []; }
}

// #901: the paths that are BLOBS under `pathspec` at `commitish`. `ls-tree -r` enumerates blobs, not
// directories, which is the one question that distinguishes "the archive directory exists at HEAD" —
// which a PARTIALLY committed archive also satisfies — from "this file is durably in the commit".
// Same NUL-only split as ignoredUntrackedUnder above, for the same reason: trimming a record here
// made a whitespace-bearing committed path read as absent from its own commit.
function blobPathsUnder(mainRoot, commitish, pathspec) {
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'ls-tree', '-r', '-z', '--name-only', commitish, '--', pathspec],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch (_) { return []; }
}

// #901: the members of `rels` this repository's ignore rules cover BY NAME ALONE — a file with the
// same BASENAME at the repository root would be ignored too. That is what separates a rule about
// WHERE a file lives (`/.cache/`, `kaola-workflow/issue-55/`: the run archive's own location, which
// is the case #901 was authorized to override) from a rule about WHAT a file is CALLED (`.DS_Store`,
// `*.log`: junk and secrets the consumer wants tracked nowhere, ever). Only the second kind is
// dropped by the callers. The force-add half of #901 overrides a rule the consumer wrote, and the
// authorization was for the run's finalization evidence — not for anything that happens to sit in
// the folder, which is what "every file on disk" delivered.
//
// ONE batched `check-ignore --stdin -z`, over synthetic ROOT-level basenames so the question is
// location-free. `--no-index` so the answer is about the RULES and not about what happens to be
// tracked. Measured: exit 1 means "none of them is ignored" and is not a fault; the output is
// NUL-terminated and lists only the ignored names. Any probe fault yields the EMPTY set, so each
// caller keeps its own pre-existing behaviour — see each call site for which way that fails.
// Kept identical to kaola-workflow-claim.js's copy; a divergence between the two is a bug.
function repoWideIgnoredNames(root, rels) {
  const names = Array.from(new Set(rels.map(r => String(r).split('/').pop()).filter(Boolean)));
  if (!names.length) return new Set();
  try {
    const out = execFileSync('git', ['-C', root, 'check-ignore', '--stdin', '-z', '--no-index'],
      { input: names.join('\0') + '\0', encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER,
        stdio: ['pipe', 'pipe', 'ignore'] });
    return new Set(out.split('\0').filter(Boolean));
  } catch (_) { return new Set(); }
}

function sinkPreflight(mainRoot, project, branch, issueNumbers) {
  // #562: worktree-clean data-loss guard — the --sink merge step force-removes the linked worktree with
  // NO clean precondition, so a dirty worktree's uncommitted work would be destroyed. Mirror the legacy
  // path's assertWorktreeClean. It throws on a dirty OR unprobeable worktree (fail-closed); convert to
  // the typed refusal sinkPreflight returns. Resume-safe: an already-removed worktree returns cleanly.
  try {
    assertWorktreeClean(mainRoot, branch);
  } catch (err) {
    return { ok: false, reason: 'worktree_dirty', detail: err.message };
  }

  const porcelain = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '-uall'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
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
    // #715: the exemption is keyed on the EXACT path, not on THIS sink's project — an interrupted
    // SIBLING sink leaves kaola-workflow/{,archive/}<sibling>/.cache/sink-receipt.json as untracked
    // residue at the main root, and refusing it as foreign dirt would block this sink on the
    // sibling's in-progress artifact. The exemption is classification-only: this sink never stages,
    // touches, or mutates the sibling receipt (the never-touches-another-project invariant is about
    // mutation; not-refusing is not mutation). Match is EXACT — <seg> is exactly one path segment,
    // any project live or archived; no prefix or directory exemption: anything else under a sibling
    // tree (kaola-workflow/archive/<other>/workflow-state.md, sink-receipt.json.tmp, a nested
    // x/.cache/sink-receipt.json, a trailing-slash form) stays bucket-3 foreign dirt. Unconditional
    // across porcelain statuses (?? and D  alike, as before). sink-fallback.json is deliberately
    // NOT exempted.
    const SINK_RECEIPT_EXEMPT = /^kaola-workflow\/(?:archive\/)?[^/]+\/\.cache\/sink-receipt\.json$/;
    if (SINK_RECEIPT_EXEMPT.test(filePath)) continue;
    // #893: THIS sink's OWN archive mirror. `cmdFinalize --keep-worktree` writes the archive tree into
    // the MAIN root and leaves it UNTRACKED there (it cannot stage a path outside its own worktree, so
    // it defers the commit to this sink's archive_commit step); bucket 2's list is live-path-only, so
    // the documented finishing sequence blocked itself on its own output. EXISTENCE and CONTENT are two
    // questions and are asked separately, because a failed read is not evidence of absence: NOT CARRIED
    // by the branch → exempt (main holds the run's ONLY copy); carried and byte-equal → exempt; carried
    // and DIVERGENT → fall through to bucket 3 and refuse loudly rather than let one side silently win;
    // carried but UNREADABLE → unverifiable, which is not absent, so it falls through too. Swallowing a
    // read fault as absence hands back the divergent case on a HEALTHY repo (a copy past GIT_MAX_BUFFER
    // overflows the read) and lets it resurface past preflight as an untyped crash. `cat-file -e` is the
    // existence probe, as in bucket 2: it reads the tree, emits no bytes of its own to overflow, and
    // answers when the blob cannot be inflated — it cannot express the divergence test, so the content
    // read follows it rather than replacing it. CLASSIFICATION-ONLY — `continue`, never projDuplicates,
    // whose action is fs.unlinkSync and would destroy the finalization summary and mission list. Scoped
    // to THIS project on a SEGMENT BOUNDARY (the trailing '/'): a sibling's archive tree and a
    // project-name prefix look-alike stay bucket-3. ?? only.
    const ownArchivePrefix = 'kaola-workflow/archive/' + project + '/';
    if (xy === '??' && filePath.startsWith(ownArchivePrefix)) {
      let branchHasPath = false;
      try { execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', branch + ':' + filePath], { stdio: 'ignore' }); branchHasPath = true; } catch (_) {}
      if (!branchHasPath) continue;
      let branchBytes = null;
      try { branchBytes = execFileSync('git', ['-C', mainRoot, 'show', branch + ':' + filePath], { maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) {}
      let workBytes = null;
      try { workBytes = fs.readFileSync(path.join(mainRoot, filePath)); } catch (_) {}
      // Byte-equality is the ONLY exemption for a path the branch carries; a failed read leaves
      // branchBytes null and can never satisfy it, so unverifiable falls through with divergent.
      if (branchBytes !== null && workBytes !== null && branchBytes.equals(workBytes)) continue;
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

// #694/#705: the ONE keep-open intent derivation for the --sink transaction — reused by the finalize
// step (to scope roadmap-source retention), persistSinkClosureMetadata (the ## Closure disposition),
// and the terminal keep_open_verify guard. Three sources: the live --keep-issue-open flag, the
// receipt's recorded keep_open_requested, OR the workflow-state.md issue_action: comment_keep_open.
// Both the archived state (post-archive) AND the live folder (pre-archive, at the finalize step
// before archiveProjectDir moves it) are probed; a missing file reads as no-signal, never an error.
function deriveSinkKeepOpen(mainRoot, args, receipt) {
  if (!!args.keepIssueOpen || (receipt && receipt.keep_open_requested === true)) return true;
  if (args.issue == null) return false;
  const candidates = [];
  if (receipt && receipt.archive_dest) candidates.push(path.join(mainRoot, receipt.archive_dest, 'workflow-state.md'));
  candidates.push(path.join(mainRoot, 'kaola-workflow', 'archive', args.project, 'workflow-state.md'));
  candidates.push(path.join(mainRoot, 'kaola-workflow', args.project, 'workflow-state.md'));
  for (const sc of candidates) {
    try { if (/^issue_action:\s*comment_keep_open\s*$/m.test(fs.readFileSync(sc, 'utf8'))) return true; } catch (_) {}
  }
  return false;
}

// #700: persist the SAME terminal metadata cmdFinalize writes — the ## Closure state block +
// the ## Attestation summary block — into the archive dest, for a --sink that is the SOLE archiver.
// Attestation reflects the REAL dispatch-log probe of the claim/author seam (no fabrication for inline
// execution). Presence-guarded/idempotent; disposition/label/invariant fields are honestly PENDING
// here (the sink's own closure + verify steps perform the real close). Fail-soft; only a missing
// export (the #550 cross-edition drift class) rethrows.
function persistSinkClosureMetadata(mainRoot, args, sinkReceipt, archiveResult) {
  const dest = archiveResult && archiveResult.dest;
  if (!dest) return;
  try {
    const keepOpen = deriveSinkKeepOpen(mainRoot, args, sinkReceipt);
    // The ## Attestation block and the ## Expansion Rollup line are gone with the mechanisms
    // behind them (claim.js retired both writers); a call to a retired export throws, here on the
    // sole-archiver path, after the merge has already landed.
    appendClosureBlock(dest, {
      issueDisposition: keepOpen ? 'kept-open' : 'close-pending',
      claimLabelRemoved: 'close-pending',
      worktreeRemoved: 'removed',
      closureInvariants: 'pending',
    });
  } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError) throw e;
  }
}

function runSinkTransaction(args, mainRoot, defBranch) {
  const loaded = loadOrInitReceipt(mainRoot, args.project, args.branch, args.issue, args.issueNumbers, defBranch, args.keepIssueOpen);
  const { receipt, newCycle } = loaded;
  // Reassignable: the finalize step's archiveProjectDir renames the live folder (receipt included)
  // into the archive dest — every later write must follow it there, or writeSinkReceipt's mkdirSync
  // resurrects a phantom empty live .cache/ and the authoritative receipt forks from the archive.
  let receiptPath = loaded.receiptPath;
  // Mirror the findings onto the journal on every receipt write. The journal is the in-flight
  // record: a run that stops before the archive commit leaves it on disk, so a resumed successor
  // reads what this attempt found without ever having seen stdout.
  const stampFindings = () => { if (sinkFindings.length) receipt.findings = sinkFindings; };

  // THE DURABLE HALF OF A CONVERTED STOP. A converted site stops with nothing merged, so the
  // receipt journal — which survives precisely BECAUSE the run did not reach terminal success — is
  // where its finding belongs. #518: the first disk write is deferred past the merge-step checkout
  // for a new-cycle reinit, so a stop before that point reaches the caller on the envelope only,
  // which is the legacy path's durability model anyway.
  const recordStopOnReceipt = (field, value) => {
    if (field) receipt[field] = value;
    receipt.updated_at = new Date().toISOString();
    stampFindings();
    if (newCycle && receipt.steps.merge !== 'done') return false;
    try { writeSinkReceipt(receiptPath, receipt); return true; } catch (_) { return false; }
  };
  const stepDone = (step) => {
    receipt.steps[step] = 'done'; receipt.updated_at = new Date().toISOString();
    stampFindings();
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
    if (receipt.steps[step] === 'done') {
      // #694: a recorded `closure: done` from a prior invocation is NOT evidence about THIS run's
      // keep-open intent. A same-cycle flag flip re-evaluates closure live (never replay a stale
      // close/keep decision). Both sides boolean-normalized: a legacy receipt without the field
      // (undefined) reads as false so a plain close resume is not spuriously re-run.
      if (step === 'closure' && !!receipt.keep_open_requested !== !!args.keepIssueOpen) {
        process.stderr.write('sink-merge --sink: keep-open intent changed since the recorded closure step (receipt ' +
          (!!receipt.keep_open_requested) + ' -> current ' + !!args.keepIssueOpen + ') — re-evaluating closure live.\n');
        receipt.keep_open_requested = !!args.keepIssueOpen;
      } else {
        continue;
      }
    }
    if (step === 'preflight') {
      const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
      args.issueNumbers = memberSet.members; args.member_source = memberSet.source;
      const preResult = sinkPreflight(mainRoot, args.project, args.branch, args.issueNumbers);
      if (!preResult.ok) {
        // sink_blocked and worktree_dirty KEEP — proceeding destroys the user's own uncommitted
        // work, so no proceed-path exists.
        sinkEmit({ result: 'refuse', reason: preResult.reason || 'sink_blocked', ...(preResult.foreign_dirt ? { foreign_dirt: preResult.foreign_dirt } : {}), detail: preResult.detail }, 1); return;
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
          sinkEmit({ result: 'refuse', reason: 'sink_incomplete', step: 'push_upstream', push_upstream: 'failed', branch: args.branch, detail: '`git push -u origin ' + args.branch + '` did not verifiably reach parity with its upstream — the feature branch may not be backed up on the remote. Refusing to report status:sinked. The push_upstream step is left NOT done so a re-run retries it. Resolve the push fault (or push manually: git push -u origin ' + args.branch + ') and re-run --sink.' }, 1); return;
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
      // The post-rebase measurement. Red STOPS the sink here, before the fast-forward: nothing is
      // merged or published, and the merge step stays NOT done so a re-run after a fix resumes
      // exactly here — the same terminal state the old throw produced, now typed and durable.
      let testGate = doRebase(args, alreadyUpToDate, mainRoot, defBranch);
      if (testGate.result === 'red') {
        recordStopOnReceipt('post_rebase_tests', 'red');
        sinkEmit({
          result: 'report', status: 'not_merged', reason: 'chains_red', step: 'merge', post_rebase_tests: 'red',
          branch: args.branch, default_branch: defBranch,
          detail: 'the post-rebase chains are RED over ' + args.branch + '. Nothing was merged into '
            + defBranch + ', nothing was pushed, and no issue was closed; the merge step is left NOT done '
            + 'so a re-run resumes here once the chains are green.',
        }, 1);
        return;
      }
      const ffOutcome = ffMergeLoop(args, mainRoot, defBranch);
      if (ffOutcome.testGate && ffOutcome.testGate.result !== 'skipped') testGate = ffOutcome.testGate;
      if (!ffOutcome.merged) {
        receipt.merge = ffOutcome.reason;
        // chains_red is the CONVERTED arm and must surface under its own name: it used to return
        // false into giveUp, which printed "FF race: exhausted retries" — the sink naming the wrong
        // cause, not merely the wrong wording.
        if (ffOutcome.reason === 'chains_red') {
          recordStopOnReceipt('post_rebase_tests', 'red');
          sinkEmit({
            result: 'report', status: 'not_merged', reason: 'chains_red', step: 'merge', post_rebase_tests: 'red',
            branch: args.branch, default_branch: defBranch,
            detail: 'the chains went RED on the re-rebased tree during fast-forward recovery. This is '
              + 'a red suite, NOT a merge race. Nothing was merged or pushed; the merge step is left '
              + 'NOT done so a re-run resumes here.',
          }, 1);
          return;
        }
        recordStopOnReceipt(null, null);
        if (ffOutcome.reason === 'non_fast_forward') {
          // Typed envelope: a bare exit code is not actionable for an output-blind consumer. Not a
          // CONVERT — nothing about the work was judged — but the resolutions are real and named.
          sinkEmit({
            result: 'report', status: 'not_merged', reason: 'non_fast_forward', step: 'merge',
            branch: args.branch, default_branch: defBranch,
            detail: 'branch ' + args.branch + ' did not fast-forward onto ' + defBranch + ' after '
              + MAX_AUTOMERGE_RETRIES + ' attempts. Nothing was merged, nothing was pushed and no issue '
              + 'was closed; the merge step is left NOT done so a re-run resumes here. Rebase onto the '
              + 'updated ' + defBranch + ' and re-run the sink, resynchronize and re-run, or run sink-pr instead.',
          }, 2);
          return;
        }
        // rebase_conflict stops bare: a true content conflict is never auto-resolved.
        process.stderr.write('sink-merge --sink: FF merge failed\n'); process.exitCode = 2; return;
      }
      receipt.post_rebase_tests = testGate.result;
      // Land the staged worktree-only content now that checkout has resolved whether the branch
      // itself tracks kaola-workflow/<project>/. #707: per-FILE union — a checkout-resolved
      // (branch-tracked) file is authoritative and is never overwritten, but a file that exists
      // ONLY in the worktree copy (untracked per-node .cache evidence) always lands. The previous
      // all-or-nothing guard discarded the whole stage whenever the live folder existed, dropping
      // the run's node evidence on every worktree-postured sink (evidence-empty archives).
      if (wtStageDir) {
        try {
          const mainProjDir = path.join(mainRoot, 'kaola-workflow', args.project);
          sinkLandStagedUnion(wtStageDir, mainProjDir);
        } catch (_) {}
        try { fs.rmSync(wtStageDir, { recursive: true, force: true }); } catch (_) {}
      }
      stepDone('merge'); continue;
    }
    if (step === 'finalize') {
      // #899: the archive is CONFIRMED, never inferred. Set when an archive was required and did not
      // happen — an operational throw the catch used to swallow, or a return that archived nothing.
      // The missing dest cannot be the discriminator: a source-missing return (keep-worktree, or no
      // live folder at all) leaves the same observable, so keying on it would refuse two legitimate
      // no-ops. What separates them is what archiveProjectDir SAID it did.
      let archiveFailure = null;
      try {
        const { archiveProjectDir } = require('./kaola-gitlab-workflow-claim');
        // #705: sole archiver — if keep-open is in force, retain the kept-open member roadmap source(s)
        // (an open issue stays tracked) via per-member excludeIssues; a closing run keeps none.
        const keepOpenAtFinalize = deriveSinkKeepOpen(mainRoot, args, receipt);
        const finalizeMembers = (Array.isArray(args.issueNumbers) && args.issueNumbers.length)
          ? args.issueNumbers
          : (args.issue != null ? [args.issue] : []);
        const archiveResult = archiveProjectDir(mainRoot, args.project, 'closed', undefined, {
          keepWorktree: false,
          excludeIssues: keepOpenAtFinalize ? finalizeMembers : [],
        });
        // An incomplete archive fails the sink loudly, whatever made it incomplete. The former
        // discriminator was `missing.length > 0` OR a non-allowlisted snapshot_error, and BOTH halves
        // were wrong now: snapshot_error has no producer left, and verifyArchiveComplete can fail with
        // an EMPTY missing[] and a non-empty mismatched[] — a file that reached the destination with
        // different bytes, or a src/dest root that is not a plain directory. That shape passed the
        // guard and the sink reported status:sinked over a project it had not archived, which is the
        // exact incident this block exists to prevent. `archive_incomplete` IS the incompleteness
        // signal, so gate on it and report both halves. Nothing was deleted — the refusal fires
        // before any archive mutation — and the finalize step is left NOT done so a re-run retries it.
        const missing = (archiveResult && archiveResult.missing) || [];
        const mismatched = (archiveResult && archiveResult.mismatched) || [];
        if (archiveResult && archiveResult.archive_incomplete === true) {
          receipt.archive_refusal = archiveResult.reason || 'archive_incomplete';
          receipt.updated_at = new Date().toISOString();
          writeSinkReceipt(receiptPath, receipt);
          sinkEmit({
            result: 'refuse',
            reason: 'sink_incomplete',
            step: 'finalize',
            archive_refusal: archiveResult.reason || 'archive_incomplete',
            missing,
            mismatched,
            branch: args.branch,
            default_branch: defBranch,
            detail: 'archiving kaola-workflow/' + args.project + '/ was refused ('
              + (archiveResult.reason || 'archive_incomplete') + '): '
              + (archiveResult.detail || (mismatched.length > 0
                ? 'the archive copy does not match the source byte-for-byte'
                : 'the archive would have lost evidence the run recorded'))
              + ' Refusing to report status:sinked. The finalize step is left NOT done so a re-run retries it; '
              + 'the live project folder was not deleted.',
          }, 1);
          return;
        }
        // #899: the positive confirmation. `archived: true` is the ONLY report that an archive
        // happened; `skipped: 'source-missing'` the only report that none was required. Anything else
        // — a bare `archived: false` with a reason (the forced-refusal seam reaches success by RETURN,
        // not by throw, so a fix at the catch alone would leave that door open), a null from a port
        // that returned nothing — archived nothing while a live folder was there to archive. That
        // test is the closure contract's archive boundary, which every other destructive caller
        // already crosses through — take it from there rather than restating it, so this port
        // cannot drift away from the wording the rest of the workflow archives by.
        const { archiveSucceeded } = require('./kaola-workflow-closure-contract');
        if (!archiveSucceeded(archiveResult)) {
          archiveFailure = {
            reason: (archiveResult && archiveResult.reason) || 'archive_not_performed',
            detail: (archiveResult && archiveResult.detail)
              || ('archiveProjectDir returned without archiving: ' + JSON.stringify(archiveResult)),
          };
        }
        // #700: carry the ACTUAL archive dest (possibly collision-suffixed) through the receipt so
        // archive_commit stages/commits the exact dir; and — as the SOLE archiver — persist the same
        // ## Closure + ## Attestation blocks cmdFinalize writes (no-op when the dest already has them).
        if (!archiveFailure && archiveResult && archiveResult.dest) {
          receipt.archive_dest = path.relative(mainRoot, archiveResult.dest).split(path.sep).join('/');
          persistSinkClosureMetadata(mainRoot, args, receipt, archiveResult);
          // The rename just moved the live receipt into the dest — follow it, so stepDone('finalize')
          // and every later step write the archived copy instead of resurrecting the live path.
          receiptPath = path.join(archiveResult.dest, '.cache', 'sink-receipt.json');
        }
      } catch (e) {
        // #555: re-throw a missing-export programmer error (the #550 drift class) — that arm is
        // unchanged and keeps naming the vanished symbol. #899: everything else used to be swallowed
        // whole, leaving the archive undone, the receipt without a dest, and the transaction free to
        // push the live run record and close the issue over an archive that never happened.
        if (e instanceof TypeError || e instanceof ReferenceError) throw e;
        archiveFailure = { reason: 'archive_exception', detail: e && e.message ? e.message : String(e) };
      }
      // #899: an archive required and not performed stops the sink HERE, before push_main and closure.
      // Not a verdict about the WORK — the destroy-class carve-out: the run record is still live on the
      // mainline and the sink may not CLAIM an archive it did not perform. Nothing was deleted, the
      // finalize step is left NOT done, and the journal survives, so a re-run resumes exactly here.
      if (archiveFailure) {
        receipt.archive_refusal = archiveFailure.reason;
        receipt.updated_at = new Date().toISOString();
        writeSinkReceipt(receiptPath, receipt);
        sinkEmit({
          result: 'refuse',
          reason: 'sink_incomplete',
          step: 'finalize',
          archive_refusal: archiveFailure.reason,
          branch: args.branch,
          default_branch: defBranch,
          detail: 'archiving kaola-workflow/' + args.project + '/ did not happen ('
            + archiveFailure.reason + '): ' + archiveFailure.detail
            + ' Refusing to report status:sinked over an archive the sink did not perform. Nothing was '
            + 'pushed to ' + defBranch + ' and no issue was closed; the live project folder was not '
            + 'deleted and the finalize step is left NOT done so a re-run retries the archive.',
        }, 1);
        return;
      }
      // The durable half, written HERE and nowhere later: the last point before archive_commit
      // stages the archive, so `## Sink Findings` rides the sink's own commit and survives a fresh
      // clone. Every converted finding is taken at or before the merge step, so the record is
      // complete by now. Covers both archiver postures (sole-archiver dest, keep-worktree archive).
      persistSinkFindingsToSummary(resolveRunRecordDir(mainRoot, args.project, receipt.archive_dest),
        receipt.post_rebase_tests || null);
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
      // #700: stage/commit the ACTUAL archive dest recorded by the finalize step. A collision-suffixed
      // archive/<project>.archived-<ts>/ escapes the hardcoded plain path (git add stages nothing → the
      // commit is skipped → stepDone runs anyway → the suffixed archive + roadmap changes never land).
      const archiveRel = (receipt.archive_dest || ('kaola-workflow/archive/' + args.project)).replace(/\/+$/, '');
      const archiveDir = path.join(mainRoot, archiveRel);
      const ps = archiveRel + '/';
      // #520/#700: exclude crash-resume journals from staging (must persist on disk, never committed).
      // Scope to the ACTUAL dest .cache AND the live folder .cache (the resolved receipt can sit there).
      const exRcpt = ':(exclude)' + ps + '.cache/sink-receipt.json';
      const exFb = ':(exclude)' + ps + '.cache/sink-fallback.json';
      const exLiveRcpt = ':(exclude)kaola-workflow/' + args.project + '/.cache/sink-receipt.json';
      const exLiveFb = ':(exclude)kaola-workflow/' + args.project + '/.cache/sink-fallback.json';
      // #700: also commit the roadmap-source removal + regenerated ROADMAP.md + the live-folder removal
      // (the sole-archiver rename moved a tracked live folder into the suffixed archive), so main's HEAD
      // is not left dirty. Scope to THIS sink's own files; a path that matches nothing is filtered out.
      const memberNums = (Array.isArray(args.issueNumbers) && args.issueNumbers.length)
        ? args.issueNumbers : (args.issue != null ? [args.issue] : []);
      const roadmapPathspecs = [];
      for (const n of memberNums) roadmapPathspecs.push('kaola-workflow/.roadmap/issue-' + n + '.md');
      roadmapPathspecs.push('kaola-workflow/ROADMAP.md');
      const livePathspec = 'kaola-workflow/' + args.project + '/';
      let liveTracked = false;
      try { const t = execFileSync('git', ['-C', mainRoot, 'ls-tree', '--name-only', 'HEAD', '--', livePathspec], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); liveTracked = t.length > 0; } catch (_) { liveTracked = false; }
      const stagedRoadmap = roadmapPathspecs.filter(rp => {
        if (fs.existsSync(path.join(mainRoot, rp))) return true;
        try { execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', 'HEAD:' + rp], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; } catch (_) { return false; }
      });
      // #832: a consumer whose .gitignore covers the archive band makes `git add <archive>` a
      // REFUSAL ("The following paths are ignored by one of your .gitignore files"), not a commit —
      // and an ignored pathspec aborts the whole add/commit, so the roadmap bookkeeping riding
      // alongside it never lands either. Probe the refusal explicitly, drop the ignored pathspec so
      // the rest still commits, and record the honest token instead of reporting done. Existence-
      // gated so a probe only runs against an archive that is actually on disk.
      let archiveIgnored = false;
      if (fs.existsSync(archiveDir)) {
        try {
          // exit 0 = ignored; exit 1 = not ignored; anything else = probe fault (not a refusal).
          execFileSync('git', ['-C', mainRoot, 'check-ignore', '-q', '--', archiveRel],
            { stdio: ['ignore', 'ignore', 'ignore'] });
          archiveIgnored = true;
        } catch (_) { archiveIgnored = false; }
      }
      // #901: the probe above asks about the archive DIRECTORY, which is the wrong granularity for a
      // rule that clips a SUBTREE out of it. A consumer's basename rule `.cache/` leaves the archive
      // directory un-ignored, so archiveIgnored stayed false and the honest-skip arm never fired;
      // `git add <archive>/` then exited 1 with git's ignore report while STILL writing the
      // non-ignored siblings to the index. The commit carried 3 of 8 files, archived_paths named the
      // 3 survivors as if they were the whole set, and archive_commit read `done`.
      //
      // So ask about the FILES. The required set is what the archive holds on disk minus the #520
      // journals; its ignored members are force-added under THIS project's own archive path only —
      // never a repo-wide `add -f`, and never a journal. A rule covering the whole BAND is a
      // DIFFERENT answer and stays honored by archiveIgnored above: that consumer asked for no
      // tracked archives at all, and #832's honest skip is the response. A rule that merely clips a
      // subtree out of an archive the consumer does want is #901, and forcing exactly those paths in
      // is the Expected behavior the issue authorizes.
      //
      // What that authorizes is the run's finalization EVIDENCE, and "every regular file on disk"
      // is not the same set. A rule the consumer wrote about a file's NAME — `.DS_Store`, `*.log` —
      // says "never track this anywhere", and an archive that happened to collect one (a Finder
      // window opened on the run folder during the run, then copied in by copyDir) would have had it
      // force-added into main's archive commit and announced as a "run-evidence file". Overriding a
      // location rule is the authorized fix; overriding a name rule is not ours to do. Subtracted
      // from the REQUIRED set rather than only from the force list, because a path that stays required
      // and is not force-added becomes a missing blob and refuses — which would brick the sink over a
      // `.DS_Store`. A probe fault subtracts nothing, i.e. leaves the pre-#901 breadth in place.
      let requiredPaths = fs.existsSync(archiveDir) ? requiredArchiveFiles(mainRoot, archiveRel) : [];
      if (requiredPaths.length > 0) {
        const ignoredByName = repoWideIgnoredNames(mainRoot, requiredPaths);
        requiredPaths = requiredPaths.filter(p => !ignoredByName.has(p.split('/').pop()));
      }
      let forcePaths = [];
      if (!archiveIgnored && requiredPaths.length > 0) {
        const ignoredHere = new Set(ignoredUntrackedUnder(mainRoot, ps));
        forcePaths = requiredPaths.filter(p => ignoredHere.has(p));
      }
      const commitPaths = (archiveIgnored ? [] : [ps]).concat(stagedRoadmap, liveTracked ? [livePathspec] : []);
      const excludes = [exRcpt, exFb, exLiveRcpt, exLiveFb];
      // The staging runs TWICE (once before the archived_paths report, once after the durable copy is
      // appended to the summary), so the ordinary sweep and the #901 forced sweep are one step. The
      // errors are RETURNED, never discarded: `git add <dir>` exits 1 whenever an ignored directory
      // sits under the pathspec — measured, and still true after that directory's files are in the
      // index — so the status alone is not a fault and must not become a refusal on its own. It is
      // routed into the per-path blob verdict below, the only place that can tell a harmless exit 1
      // from a partial add. That routing is exactly what `catch (_) {}` used to throw away.
      const stageArchive = () => {
        const errs = [];
        try { execFileSync('git', ['-C', mainRoot, 'add', '--', ...commitPaths, ...excludes], { encoding: 'utf8' }); }
        catch (e) { errs.push('git add: ' + String((e && e.message) || e).trim()); }
        if (forcePaths.length) {
          try { execFileSync('git', ['-C', mainRoot, 'add', '-f', '--', ...forcePaths], { encoding: 'utf8' }); }
          catch (e) { errs.push('git add -f: ' + String((e && e.message) || e).trim()); }
        }
        return errs;
      };
      let addErrors = [];
      if (fs.existsSync(archiveDir) && commitPaths.length > 0) {
        addErrors = stageArchive();
        if (forcePaths.length) {
          // Overriding a rule the consumer wrote is never silent. Recorded on the receipt (so it
          // rides the emitted envelope) as well as on stderr, and scoped to files this project's own
          // archive already holds.
          receipt.archive_forced_paths = forcePaths.slice();
          process.stderr.write('sink-merge --sink: NOTE: ' + forcePaths.length + ' run-evidence file(s) under '
            + archiveRel + ' are covered by this repository\'s .gitignore; force-added so the archive survives a '
            + 'fresh clone: ' + forcePaths.join(', ') + '\n');
        }
        // #893: name what this commit carries under THIS project's own archive path. Taken from the
        // index AFTER the add and BEFORE the commit — the one moment the answer is both knowable and
        // still changeable. Scoped to `ps`, so a SIBLING's archive residue (#715-exempt at preflight
        // and never in commitPaths) is correctly absent: reporting a path this sink never touched
        // would be a different lie from staying silent about one it did. The durable copy goes into
        // the archived summary and is re-staged, so it rides this same commit instead of being left
        // dirty behind it; the writer only appends to a summary the add already swept, so the set
        // cannot shift underneath the report.
        receipt.archived_paths = stagedPathsUnder(mainRoot, ps, excludes);
        if (persistArchivedPathsToSummary(archiveDir, receipt.archived_paths)) {
          addErrors = addErrors.concat(stageArchive());
        }
        let hasStaged = false;
        try { execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--quiet', '--', ...commitPaths, ...excludes], { stdio: 'ignore' }); }
        catch (e) { if (e && e.status === 1) hasStaged = true; }
        // #521: the COMMIT-side :(exclude) is defensive so the guard holds if a future change ever
        // modifies a tracked non-receipt band file at archive_commit. Kept (do NOT drop as redundant).
        if (hasStaged) { try { execFileSync('git', ['-C', mainRoot, 'commit', '-m', 'chore: archive ' + args.project + ' [sink]', '--', ...commitPaths, ...excludes], { encoding: 'utf8' }); } catch (_) {} }
      }
      // #700: do NOT stepDone unless the archive THIS sink produced (receipt.archive_dest set) is
      // committed or already at HEAD. When unset the sink archived nothing (keep-worktree has it at
      // HEAD from the merge; a genuinely-absent archive proceeds as before) — never a false refusal.
      let archiveAtHead = false;
      try { const t = execFileSync('git', ['-C', mainRoot, 'cat-file', '-t', 'HEAD:' + archiveRel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); archiveAtHead = (t === 'tree'); } catch (_) { archiveAtHead = false; }
      // #901: the ONE question that makes archive_commit:"done" truthful — is each required archive
      // path a BLOB in the published commit? The tree-existence probe above cannot answer it: a
      // PARTIALLY committed archive still yields `tree`, so a run that dropped 5 of its 8 files
      // reported done, exit 0, and a complete-looking archived_paths list, and nothing anywhere
      // noticed. Measured unconditionally (never gated on archive_dest — the keep-worktree posture,
      // where the dest is unset, lost the same files), and an absent archive yields an empty required
      // set that cannot false-refuse. `missingBlobs` is the single measurement both arms below read.
      let missingBlobs = [];
      if (requiredPaths.length > 0) {
        const blobs = new Set(blobPathsUnder(mainRoot, 'HEAD', archiveRel));
        missingBlobs = requiredPaths.filter(p => !blobs.has(p));
      }
      if (missingBlobs.length > 0) receipt.archive_missing_paths = missingBlobs;
      // #832: an archive the consumer's .gitignore covers can NEVER reach HEAD, so the #700
      // never-committed refusal below would brick every such repo. That is not the remedy the
      // incident asks for — the sink still completes; it just stops claiming a commit git refused.
      // #901: this is the arm where the force-add is DECLINED by design — the rule covers the whole
      // archive band, so the consumer asked for no tracked archives and that answer is honored. What
      // was missing was the inventory: name every required file the skip leaves uncommitted
      // (receipt.archive_missing_paths above) so the loss is itemized, not merely announced.
      if (archiveIgnored) {
        receipt.archive_commit = 'skipped_gitignored';
        process.stderr.write('sink-merge --sink: WARNING: ' + archiveRel + ' is covered by this repository\'s '
          + '.gitignore — git REFUSES to track the run archive, so it was NOT committed'
          + (missingBlobs.length ? ' (' + missingBlobs.length + ' run-evidence file(s) uncommitted; see '
            + 'archive_missing_paths)' : '')
          + '. The archive exists on '
          + 'disk only and will not survive a fresh clone. Un-ignore kaola-workflow/archive/ to make run '
          + 'archives durable.\n');
      }
      if (receipt.archive_dest && !archiveAtHead && !archiveIgnored) {
        receipt.archive_commit = 'failed';
        receipt.updated_at = new Date().toISOString();
        writeSinkReceipt(receiptPath, receipt);
        sinkEmit({
          result: 'refuse', reason: 'sink_incomplete', step: 'archive_commit',
          archive_dest: archiveRel, branch: args.branch, default_branch: defBranch,
          detail: 'the archive directory (' + archiveRel + ') is neither committed nor present at ' + defBranch + ' HEAD — the archive + roadmap-source removal + regenerated ROADMAP.md never landed in a commit (a collision-suffixed dest escaping the archive commit, #700). Refusing to report status:sinked. The archive_commit step is left NOT done so a re-run retries it.',
        }, 1);
        return;
      }
      // #901: the archive band is committable (not ignored) and yet a required path is absent from
      // the commit — the force-add above either could not run or did not take. That is the shape the
      // incident produced, and reporting `done` over it publishes a complete-looking record of an
      // incomplete archive. Refuse, name EVERY missing file, and carry the add exit statuses that
      // used to be swallowed: they are the diagnosis for why the paths are absent. Returning here is
      // before teardown, so the branch, the worktree and the on-disk archive are all retained — the
      // recoverable source is never the thing this refusal destroys, and a re-run retries the step.
      if (!archiveIgnored && missingBlobs.length > 0) {
        receipt.archive_commit = 'failed';
        receipt.updated_at = new Date().toISOString();
        writeSinkReceipt(receiptPath, receipt);
        sinkEmit({
          result: 'refuse', reason: 'sink_incomplete', step: 'archive_commit',
          archive_dest: archiveRel,
          archive_missing_paths: missingBlobs,
          archive_add_errors: addErrors,
          branch: args.branch, default_branch: defBranch,
          detail: missingBlobs.length + ' required archive path(s) exist on disk under ' + archiveRel
            + ' but are NOT blobs in ' + defBranch + ' HEAD, so the run evidence would not survive a fresh clone: '
            + missingBlobs.join(', ') + '. Refusing to report status:sinked for a partially committed archive '
            + '(#901). The archive_commit step is left NOT done so a re-run retries it; the branch, the worktree '
            + 'and the on-disk archive are preserved.',
        }, 1);
        return;
      }
      const archRcptPath = path.join(archiveDir, '.cache', 'sink-receipt.json');
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
          sinkEmit({ result: 'refuse', reason: 'sink_incomplete', step: 'push_main', push_main: 'failed', branch: args.branch, default_branch: defBranch, detail: 'the merge landed on the LOCAL ' + defBranch + ' but `git push origin ' + defBranch + '` failed — the deliverable is NOT on the remote. Refusing to report status:sinked (a transient push failure must not look like a completed sink). The push step is left NOT done so a re-run retries it. Resolve the push fault and re-run --sink.' }, 1); return;
        }
      }
      stepDone('push_main');
      // #517: keep-open verification — if keepIssueOpen was set, the merge commit body may have
      // contained a "close/fix/resolve #N" keyword that caused the forge to auto-close the issue at
      // push time. Post-push, probe the live issue state; if it is now CLOSED, reopen it (glab issue
      // reopen) and record the event in the receipt so callers can detect + audit it.
      if (!OFFLINE && args.keepIssueOpen && args.issue != null) {
        try {
          if (probeIssueClosed(args.issue, { cwd: mainRoot })) {
            reopenIssue(args.issue, { cwd: mainRoot });
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
          sinkEmit({
            result: 'refuse',
            reason: 'remote_closed_after_publish_unverified',
            branch: args.branch,
            default_branch: defBranch,
            detail: 'refusing to close any issue: the recorded implementation commit (' + (implRef || '(unknown)') +
              ') is not an ancestor of ' + defBranch + ' — the merge was never verified as actually published. ' +
              'No issue was closed. The closure step is left NOT done so a re-run retries it once the merge state is resolved.',
          }, 1);
          return;
        }
      }
      // GitLab: use forge.closeIssue / forge.updateIssue (glab/MR nouns, not GitHub CLI)
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
            else { failed.push(n); process.stderr.write('sink-merge --sink: WARNING: merge request/issue close failed for ' + n + '\n'); }
          }
        };
        if (args.issue != null) {
          closeOne(args.issue);
          try { forge.updateIssue(args.issue, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
        }
        // Bundle members — includes the no-primary bundle shape (#592): when args.issue is
        // absent, every member in args.issueNumbers is closed (none is "the primary" to skip).
        if (Array.isArray(args.issueNumbers) && args.issueNumbers.length > (args.issue != null ? 1 : 0)) {
          for (const n of args.issueNumbers) {
            if (n === args.issue) continue;
            closeOne(n);
            try { forge.updateIssue(n, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
          }
        }
        // #592: record the actually-closed set on the receipt (both the success and failure
        // paths) so a resume can VERIFY-then-retry against it rather than silently skip.
        if (closed.length > 0) receipt.closed_issues = closed.slice().sort((a, b) => a - b);
        // #497: only the FAILURE path refuses — SUCCESS still falls straight through to
        // stepDone('closure') below (now carrying receipt.closed_issues per #592).
        if (failed.length > 0) {
          receipt.remote_issue_closed = 'partial'; receipt.updated_at = new Date().toISOString(); writeSinkReceipt(receiptPath, receipt);
          sinkEmit({ result: 'refuse', reason: 'sink_incomplete', step: 'closure', remote_issue_closed: 'partial', closed_issues: closed.sort((a, b) => a - b), failed_issue_closures: failed.sort((a, b) => a - b), branch: args.branch, detail: 'the merge landed but ' + failed.length + ' issue(s) could not be closed on the forge (' + failed.join(', ') + '). Refusing to report status:sinked. The closure step is left NOT done so a re-run retries it. Manually close the issue(s) or resolve the forge fault, then re-run --sink.' }, 1); return;
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
      sinkEmit({ result: 'refuse', reason: 'stale_sink_receipt', branch: args.branch, default_branch: defBranch, detail: 'all sink steps report "done" but branch "' + args.branch + '" is NOT an ancestor of "' + defBranch + '" — the merge was never applied (a stale receipt resumed from kaola-workflow/archive/' + args.project + '/.cache/sink-receipt.json). Refusing to report status:sinked (main would silently not advance and the deliverable would be lost). Reset the receipt steps or remove the stale archived sink-receipt.json, then re-run --sink so the branch actually merges.' }, 1); return;
    }
  }
  // #694: keep-open END-STATE guard — the keep-open mirror of remote_closed_after_publish. Runs on
  // EVERY path to terminal success regardless of which steps were skipped (a stale/resumed receipt can
  // skip the closure keep-open handling AND the push_main #517 reopen). If keep-open is in force and
  // the issue is CONFIRMED closed on the forge, reopen it; if STILL closed after the reopen attempt,
  // refuse sink_incomplete rather than report a clean sink over a silently-retired epic. Intent is
  // defense-in-depth (flag OR receipt.keep_open_requested OR archived issue_action: comment_keep_open).
  // Trust the push_main #517 reopen when it already ran (reopened_after_autoclose): this is a BACKSTOP
  // for paths that SKIPPED push_main. Probe error / not-confirmed-closed proceeds; only a POSITIVE
  // still-closed after reopen refuses.
  {
    // #705: ONE derivation, shared with the finalize step + persistSinkClosureMetadata.
    const keepOpen = deriveSinkKeepOpen(mainRoot, args, receipt);
    if (!OFFLINE && keepOpen && args.issue != null && receipt.remote_issue_closed !== 'reopened_after_autoclose') {
      let stillClosed = false;
      try {
        if (probeIssueClosed(args.issue, { cwd: mainRoot })) {
          try { reopenIssue(args.issue, { cwd: mainRoot }); } catch (_) {}
          stillClosed = probeIssueClosed(args.issue, { cwd: mainRoot });
          if (!stillClosed) { receipt.remote_issue_closed = 'reopened_after_autoclose'; receipt.updated_at = new Date().toISOString(); writeSinkReceipt(receiptPath, receipt); }
        }
      } catch (_) { stillClosed = false; }
      if (stillClosed) {
        receipt.remote_issue_closed = 'failed'; receipt.updated_at = new Date().toISOString(); writeSinkReceipt(receiptPath, receipt);
        sinkEmit({ result: 'refuse', reason: 'sink_incomplete', step: 'keep_open_verify', keep_open_requested: true, remote_issue_closed: 'failed', issue: args.issue, branch: args.branch, detail: 'keep-open was in force but issue #' + args.issue + ' is CLOSED on the forge after push (a close-keyword commit likely auto-closed it) and could not be reopened. Refusing to report status:sinked — a kept-open epic must not be silently retired. Reopen the issue (or resolve the forge fault), then re-run --sink.' }, 1); return;
      }
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
  const journalDisposed = disposeSinkJournals(mainRoot, args.project, receipt.archive_dest);
  // A successful sink still carries its findings: green is not the same as nothing-found, and the
  // journal that held them is gone by now — the archived `## Sink Findings` is what outlives this.
  sinkEmit({ result: 'ok', status: 'sinked', journal_disposed: journalDisposed, receipt: finalReceipt });
}

const SINK_USAGE = 'usage: kaola-gitlab-workflow-sink-merge.js --branch B --project P [--issue N] [--issue-numbers A,B] [--keep-issue-open] [--sink]\n'
  + '  --sink         run the full sink TRANSACTION (merge → close → delete branch → remove worktree).\n'
  + '  --help, -h     print this usage and exit (no side effects).';

function main() {
  const rawArgv = process.argv.slice(2);
  // #476: --help/-h is a SAFE no-op — checked on the RAW argv BEFORE parseArgs (mirroring claim.js) so a
  // value flag cannot SWALLOW the help token (`--issue-numbers -h` would otherwise consume -h as a value,
  // bypassing the post-parse args.help gate). Print usage + exit 0 with ZERO side effects (this script's
  // default action is a DESTRUCTIVE merge/close/delete; a help probe must never run it).
  if (rawArgv.includes('--help') || rawArgv.includes('-h')) { process.stdout.write(SINK_USAGE + '\n'); return; }
  const isSinkMode = rawArgv.includes('--sink');
  const args = parseArgs(rawArgv);
  // #476: reject UNRECOGNIZED flags with a typed unknown_flag refusal and ZERO mutation, before any
  // side effect — an unknown flag must never fall through into the destructive transaction.
  if (args.unknownFlags && args.unknownFlags.length) {
    const hint = 'Unrecognized flag(s): ' + args.unknownFlags.join(', ') + '. Refusing with zero side effects — run `--help` for usage.';
    sinkEmit({ result: 'refuse', reason: 'unknown_flag', unknownFlags: args.unknownFlags, operator_hint: hint }, 1); return;
  }
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
