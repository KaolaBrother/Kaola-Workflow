#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const forge = require('./kaola-gitea-forge');
const classifier = require('./kaola-gitea-workflow-classifier');
// issue #227 (adaptive path): forge-neutral constants + toggle resolution.
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');
// #579: shared resolver — single source replacing local re-impls.
const { getCoordRoot, mainRootFromCoord, resolveMainRoot, parsePorcelainPaths, isParkedLanePath,
  splitNulPaths } = adaptiveSchema;
// #579: lane session helpers from forge classifier (in-process; no subprocess).
const { resolveSessionMarker, classifyLane } = classifier;

const {
  field,
  getRoot,
  isSafeName,
  issueIsClosed,
  probeIssueState,
  readActiveFolders
} = require('./kaola-gitea-workflow-active-folders');
const roadmapModule = require('./kaola-gitea-workflow-roadmap');
const closureContract = require('./kaola-workflow-closure-contract');
// parseGoal reads the run's goal (the mission list's H1); the two expansion readers feed the
// archive rollup line below. All three come from the kernel, so nothing in the finalize/archive
// path loads a plan reader.
const { parseGoal } = adaptiveSchema;

const CLAIM_LABEL = forge.CLAIM_LABEL || 'workflow:in-progress';
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE !== '0';
// #666: cap unbounded-in-repo-size git execFileSync calls at 64 MB — Node's execFileSync default
// maxBuffer is 1 MB, and a repo-size-scaling diff/listing can exceed it and crash with ENOBUFS.
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
// The #520 transaction JOURNALS. sink-receipt.json / sink-fallback.json are cycle-local scratch the
// sink script owns — never part of the deliverable, never committed, and never counted as evidence a
// live copy would lose. Three sites asked that question through three hand-copied regexps, so a
// change to what counts as a journal could reach two of them and silently miss the third; one
// definition removes the third-copy failure mode. Anchored on a path SEGMENT boundary (`^` or `/`),
// so a file merely ENDING in the name (`stale-sink-receipt.json`) is not a journal.
const SINK_JOURNAL_RE = /(^|\/)sink-(receipt|fallback)\.json$/;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// M4 (#277): derive run_posture from the actual provisioning outcome.
// worktreePath truthy => 'worktree'; falsy => 'in-place'.
// Pure / unit-testable; no env reads.
function deriveRunPosture(worktreePath) {
  return worktreePath ? 'worktree' : 'in-place';
}

// #476: the closed allowlist of VALUE-taking flags (camelCase, as the generic branch stores them).
// A `--flag value` whose name is NOT here is an UNRECOGNIZED flag — recorded for a typed unknown_flag
// refusal in main() BEFORE any destructive side effect, never silently dropped. The boolean flags are
// the explicit `--x` branches below (they `continue`); anything reaching the generic branch is either a
// known value flag or unknown. (Keep this in sync with the value flags the subcommands read.)
const KNOWN_VALUE_FLAGS = new Set([
  'branch', 'issue', 'project', 'reason', 'runtime', 'sink',
  'targetIssue', 'targetIssues', 'workflowPath', 'prNumber', 'issueNumbers', 'base',
  // #603: the Codex dispatch mode the startup surface passes from preflight detection.
  'codexDispatchMode',
  // The free-origin selection record. `--target-source` declares whether the claim
  // was ORIGINATED by an orchestrator survey (`orchestrator_selected`) or named by the user
  // (`user_directed`, the default); `--selection-record` carries the typed selection record the
  // orchestrator authored during the free sensing phase.
  'targetSource', 'selectionRecord',
]);

// #775 (Codex 0.145 re-baseline): --codex-dispatch-mode is now a WARN-AND-IGNORE shim, mirroring
// #770's --workflow-path policy exactly — v2-task-name is the only legal mode (V1/v1-thread-id is
// retired with no fallback), so the flag no longer selects or validates anything. One stderr notice,
// never a refusal, never an unknown_flag — a caller still passing the old flag is not broken.
const CODEX_DISPATCH_MODE_IGNORED_NOTE = 'note: --codex-dispatch-mode has no effect; v2-task-name is '
  + 'the only dispatch mode. Ignoring.';

// Returns { present:false } when the flag was absent (byte-identical claim behavior), or
// { present:true } when it was passed (any value — the caller warns and ignores it; the value is
// never persisted or validated).
function resolveCodexDispatchModeFlag(args) {
  return { present: args.codexDispatchMode != null };
}

// #770: module-level latch so the --workflow-path warn-and-ignore notice prints ONCE per process
// even though parseArgs runs twice per invocation (once in main() for the top-level unknown-flag
// check, once again inside the dispatched subcommand handler).
let workflowPathRetiredWarned = false;

// #816: same latch shape for the retired finalize-seam attest flag.
const FINALIZE_ATTEST_FLAG_RETIRED_NOTE = 'note: --attest-contractor-spawn has no effect; the '
  + 'finalize seam is orchestrator-owned and records no dispatch attestation. Ignoring.';
let finalizeAttestFlagRetiredWarned = false;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    // #476: --help/-h is a SAFE no-op (main() prints usage + exits 0 with zero side effects).
    if (key === '--help' || key === '-h') { args.help = true; continue; }
    if (key === '--json') { args.json = true; continue; }
    if (key === '--force') { args.force = true; continue; }
    if (key === '--keep-worktree') { args.keepWorktree = true; continue; }
    // #395.5 (D1): OPT-IN exit gate — cmdFinalize exits 4 on ok:false; DEFAULT stays exit 0.
    if (key === '--strict') { args.strict = true; continue; }
    // #837: `finalize --check` — the ONE-PASS precondition report. Read-only: it evaluates every
    // finalize precondition together and emits cmdVerifySink's { project, ok, checks, reasons }
    // shape, so N unmet preconditions come back from ONE invocation instead of one refusal per
    // round-trip. Must be a REGISTERED boolean flag: main()'s unknown_flag guard refuses any
    // unrecognized long flag with zero mutation, so the flag cannot exist until it is parsed here.
    if (key === '--check') { args.check = true; continue; }
    // #333: keep-open partial-close archive — stamp-only (lane mechanics deferred to #336).
    if (key === '--keep-open') { args.keepOpen = true; continue; }
    // #336: --keep-issue-open is the design-specified cmdFinalize keep-open flag; the
    // implementation reuses args.keepOpen internally, so alias it here. Every prose surface
    // (finalize.md/SKILL.md ×6, README, SKILL.md) dispatches
    // --keep-issue-open; without this alias it is an inert no-op on cmdFinalize and the
    // crash-resume keep-open path (live state archived, state-derivation unavailable) silently
    // close-modes — false-failed closure receipt + roadmap-source-absent invariant fire.
    if (key === '--keep-issue-open') { args.keepOpen = true; continue; }
    if (key === '--execute') { args.execute = true; continue; }
    if (key === '--archive') { args.archive = true; continue; }
    if (key === '--export')  { args.export = true; continue; }
    if (key === '--keep-branch') { args.keepBranch = true; continue; }
    // #816: the finalize-seam self-attest flag is RETIRED — the finalize seam is orchestrator-owned
    // by design, so inline execution is no longer suspect and there is nothing to back-fill. Kept as
    // a warn-and-ignore shim (the --workflow-path precedent): a stale caller still passing it is
    // never hit with an unknown_flag refusal, and the flag selects, validates, and records nothing.
    if (key === '--attest-contractor-spawn') {
      if (!finalizeAttestFlagRetiredWarned) {
        finalizeAttestFlagRetiredWarned = true;
        process.stderr.write(FINALIZE_ATTEST_FLAG_RETIRED_NOTE + '\n');
      }
      continue;
    }
    if (key.startsWith('--')) {
      const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (KNOWN_VALUE_FLAGS.has(name)) {
        // issue #770: --workflow-path is RETIRED — adaptive is the only path. Warn-and-ignore
        // shim (the --enable-adaptive precedent): stays a KNOWN flag so a caller passing it is
        // never hit with an unknown_flag refusal; print a one-line stderr notice and keep
        // parsing (the captured value, if any, is no longer read by any selection logic).
        if (name === 'workflowPath' && !workflowPathRetiredWarned) {
          workflowPathRetiredWarned = true;
          process.stderr.write('--workflow-path is retired; running adaptive\n');
        }
        // A known value flag consumes the next token iff it exists and is not itself a flag (mirrors
        // the historical generic-branch rule; a missing value leaves the flag undefined, not "unknown").
        if (val !== undefined && !val.startsWith('--')) { args[name] = val; i++; }
        continue;
      }
      // #476: an UNRECOGNIZED long flag (e.g. --help slipping past, --typo) — record it, do NOT drop
      // it. main() turns a non-empty unknownFlags into a typed `unknown_flag` refusal with ZERO
      // mutation, before any destructive subcommand body runs.
      (args.unknownFlags || (args.unknownFlags = [])).push(key);
      continue;
    }
    // #476: an unrecognized SHORT flag (e.g. -x). `-h` is handled above; a bare `-` is not a flag.
    if (key.startsWith('-') && key.length > 1) {
      (args.unknownFlags || (args.unknownFlags = [])).push(key);
      continue;
    }
  }
  for (const key of ['issue', 'targetIssue', 'prNumber']) {
    if (args[key] != null) args[key] = parseInt(args[key], 10);
  }
  // #328: --target-issues A,B,C (or KAOLA_TARGET_ISSUES env) — sorted, unique int array.
  // The generic --flag value branch above already captures args.targetIssues as a string.
  const envTargets = process.env.KAOLA_TARGET_ISSUES;
  if (args.targetIssues == null && envTargets) args.targetIssues = envTargets;
  if (typeof args.targetIssues === 'string') {
    // #370: a token like '4x' must REFUSE, not silently coerce (parseInt('4x')===4) or drop.
    const rawTokens = args.targetIssues.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const invalid = rawTokens.filter(t => !/^\d+$/.test(t) || parseInt(t, 10) <= 0);
    if (invalid.length) args.targetIssuesInvalidTokens = invalid;
    args.targetIssues = rawTokens
      .filter(t => /^\d+$/.test(t) && parseInt(t, 10) > 0)
      .map(t => parseInt(t, 10));
    // sort ascending + dedupe — load-bearing for bundle_id/collision detection
    args.targetIssues = Array.from(new Set(args.targetIssues)).sort((a, b) => a - b);
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

// #427: idempotent forge issue close — probe-before-close prevents double-close; label removal
// is best-effort (ignore failure). Returns 'closed', 'already_closed', or 'failed'.
// #619: a fresh, UN-memoized live probe for post-close verification — mirrors sink-merge.js's own
// probeIssueClosed. probeIssueState (imported above) memoizes per-process; the pre-close probe
// already primes that memo with the pre-close verdict, so reusing it post-close would always
// replay the STALE pre-close state, not a fresh one (breaking every genuine success, not just
// adding coverage). Any probe error degrades to false (never claim closed without live evidence).
function probeIssueClosedLive(issueNumber, opts) {
  if (OFFLINE || issueNumber == null) return false;
  try {
    const st = forge.viewIssue(issueNumber, opts || {});
    return String((st && st.state) || '').toLowerCase() === 'closed';
  } catch (_) { return false; }
}

// #427: idempotent forge issue close — probe-before-close prevents double-close. Returns 'closed',
// 'already_closed', or 'failed'.
// #619: a `forge.closeIssue` success is not proof the issue is actually closed on the forge — post-
// probe LIVE on the success path too, not just in the catch branch, and bucket a
// success-call-but-still-open close as failed.
function closeIssueIdempotent(n, opts) {
  const probe = probeIssueState(n);
  if (probe.state === 'closed') return 'already_closed';
  if (probe.state === 'unavailable') return 'failed';
  try {
    forge.closeIssue(n, opts);
    return probeIssueClosedLive(n, opts) ? 'closed' : 'failed';
  } catch (e) {
    return probeIssueClosedLive(n, opts) ? 'already_closed' : 'failed';
  }
}

// getCoordRoot and mainRootFromCoord are now imported from adaptiveSchema (#579 shared resolver).
// Their call sites below are byte-stable (same function names, same signatures).

function worktreePathFor(root, project) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  return path.join(mainRoot, '.kw', 'worktrees', project);
}

function legacySiblingWorktreePathFor(root, project) {
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

function inPlaceHead(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return ''; }
}

function treeDirty(root, ownedProjects, exemptRelPaths) {
  // #557: an UNPROBEABLE tree must fail CLOSED = treated as DIRTY (mirror #496); was catch → return false
  // (fail-OPEN). KAOLA_WORKFLOW_FORCE_STATUS_FAIL=1 is a [TEST ONLY] probe-fault seam.
  // #579: parked-aware — kaola-workflow/<non-owned>/* and .kw/worktrees/<non-owned>/* are ignored.
  // #715: exemptRelPaths (optional) exempts the EXACT repo-relative paths the caller itself just
  // created (cmdRelease passes the release's own fresh archive dest — the ACTUAL result.dest, never
  // a reconstructed plain path, the #700 lesson) so the in-place base restore is not vetoed by the
  // very archive the release is about to commit. Segment-boundary exact matching; every OTHER dirty
  // path still blocks. isParkedLanePath semantics untouched (archive/* stays never-parked).
  try {
    if (process.env.KAOLA_WORKFLOW_FORCE_STATUS_FAIL === '1') throw new Error('forced git status probe failure [TEST ONLY]');
    const owned = Array.isArray(ownedProjects) ? ownedProjects : [];
    const exempt = (Array.isArray(exemptRelPaths) ? exemptRelPaths : [])
      .map(p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, ''))
      .filter(Boolean);
    // #715: only when an exemption is in play, enumerate untracked files individually (-uall):
    // the default -unormal COLLAPSES a wholly-untracked tree (e.g. a fixture's kaola-workflow/)
    // into one ancestor entry, which would hide both the exempt dest and any genuinely foreign
    // file beside it. Without an exemption the command (and today's exact semantics) is unchanged.
    const statusArgs = ['-C', root, 'status', '--porcelain'].concat(exempt.length ? ['-uall'] : []);
    const status = execFileSync('git', statusArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER }).trim();
    if (!status) return false;
    const isExempt = (p) => {
      const norm = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
      return exempt.some(e => norm === e || norm.startsWith(e + '/'));
    };
    return parsePorcelainPaths(status).some(p => !isExempt(p) && !isParkedLanePath(p, owned));
  } catch (_) { return true; }
}

function defaultBranch(root) {
  // #397.3: probe chain (offline-safe). symbolic-ref (local) → remote show → ls-remote --symref → 'main'.
  try {
    const ref = execFileSync('git', ['-C', root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (ref) return ref.replace(/^origin\//, '');
  } catch (_) {}
  if (OFFLINE) return 'main';
  try {
    const out = execFileSync('git', ['-C', root, 'remote', 'show', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
    const m = out.match(/^\s*HEAD branch:\s*(\S+)\s*$/m);
    if (m && m[1] && m[1] !== '(unknown)') return m[1];
  } catch (_) {}
  try {
    const out = execFileSync('git', ['-C', root, 'ls-remote', '--symref', 'origin', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
    const m = out.match(/^ref:\s*refs\/heads\/(\S+)\s+HEAD\s*$/m);
    if (m && m[1]) return m[1];
  } catch (_) {}
  return 'main';
}

function worktreeRegistered(root, wtPath) {
  try {
    return execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' }).includes('worktree ' + wtPath + '\n');
  } catch (_) {
    return false;
  }
}

function provisionWorktree(root, project, branch) {
  // #398.1: guard the branch BEFORE `git worktree add -b <branch>`.
  assertSafeBranchArg(branch, 'provisionWorktree');
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

// #832: the ONE choke point every destructive caller funnels through (the sink's pre-checkout
// removal, its terminal teardown, the legacy non---sink Step 3, cmdFinalize's own removal, and
// release/discard). The archive-presence precondition lives HERE and nowhere else: per-call-site
// probes are exactly why #676/#707/#746/#497 each fixed one site and left the family alive.
// Existence-only, on the plain archive/<project> path, no git state involved — when the run's
// archive exists ONLY inside the tree about to be deleted, `git worktree remove --force` would
// destroy the run's only evidence trail.
//
// ADR 0013 R3 — the precondition is DISCHARGED, not demanded. This used to refuse with a typed
// archive-only-in-the-worktree reason and hand the operator an rsync: the remedy was a deterministic
// copy of a directory the script already knows the source and destination of, which makes the
// refusal a missing tool wearing a uniform. (The retired token is deliberately not spelled here —
// a dead code name in a live comment is the residue T11 exists to delete.) It is now the same
// subtraction #837 made for the finalize worktree->main sync, and for the same reason: the blocker is state the workflow manufactured out
// of its own commit policy (the archive resolves under MAIN, the worktree holds the only copy until
// the sink commits it), so it is a repair obligation the machinery discharges before the gate.
// The teardown RESCUES the archive up into the main checkout, VERIFIES the copy landed, and only
// then removes the tree. Nothing is laundered (R4): the transformation preserves evidence — losing
// it is the exact outcome the refusal existed to prevent — and it is fail-closed on both halves,
// because a copy that throws OR a destination that does not verify leaves the tree untouched and
// reports the machine failure under the same `mirror_sync_failed` reason #837 already ships for a
// sync the script owes and cannot perform. One rule, one wording: there is no second code for
// "the archive could not be moved to safety".
function removeWorktree(root, project, folder) {
  const wtPath = (folder && folder.worktree_path) || worktreePathFor(root, project);
  if (!wtPath || !fs.existsSync(wtPath)) return { removed: false, reason: 'missing' };
  let archiveRescued = false;
  if (isSafeName(project)) {
    const wtArchive = path.join(wtPath, 'kaola-workflow', 'archive', project);
    const rootArchive = path.join(root, 'kaola-workflow', 'archive', project);
    if (fs.existsSync(wtArchive) && !fs.existsSync(rootArchive)) {
      let rescueFailure = null;
      try {
        mergeCopyDir(wtArchive, rootArchive);
      } catch (e) {
        if (e instanceof TypeError || e instanceof ReferenceError) throw e;
        rescueFailure = String((e && e.message) || e).slice(0, 400);
      }
      // Positive proof, not an absence of exceptions: every regular file under the worktree archive
      // must exist at the destination. A partial copy that threw nothing is still evidence loss, and
      // this is the last moment it is detectable.
      let unrescued = [];
      if (!rescueFailure) {
        try {
          unrescued = listArchiveFilesRelative(wtArchive)
            .filter(rel => !fs.existsSync(path.join(rootArchive, ...rel.split('/'))));
        } catch (e) {
          if (e instanceof TypeError || e instanceof ReferenceError) throw e;
          rescueFailure = 'the rescue could not be VERIFIED (' + String((e && e.message) || e).slice(0, 200) + ')';
        }
      }
      if (rescueFailure || unrescued.length) {
        return {
          removed: false,
          reason: 'mirror_sync_failed',
          path: wtPath,
          detail: 'the run archive exists ONLY inside the worktree being deleted and the teardown '
            + 'could not sync it up into the main checkout'
            + (rescueFailure ? ': ' + rescueFailure
              : ' (' + unrescued.length + ' file(s) did not land: ' + unrescued.slice(0, 5).join(', ') + ')'),
          ...(unrescued.length ? { unrescued } : {})
        };
      }
      archiveRescued = true;
    }
  }
  try {
    execFileSync('git', ['worktree', 'remove', '--force', '--', wtPath], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore']
    });
    return { removed: true, path: wtPath, ...(archiveRescued ? { archive_rescued: true } : {}) };
  } catch (_) {
    return { removed: false, path: wtPath, ...(archiveRescued ? { archive_rescued: true } : {}) };
  }
}

// Every regular file under an archive directory, as `/`-joined relative paths. Symlinks are skipped
// for the same reason mergeCopyDir skips them (never follow a link out of the tree), so the two
// walks agree on what "landed" means and the verification cannot false-fail on a link.
function listArchiveFilesRelative(dir) {
  const out = [];
  (function walk(abs, rel) {
    // Deliberately NOT guarded: an unreadable source directory must propagate to the caller, which
    // records it as a rescue failure. Swallowing it here would return a SHORT list and make the
    // verification pass vacuously — a green answer produced by not looking.
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const childRel = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), childRel);
      else if (e.isFile()) out.push(childRel);
    }
  })(dir, '');
  return out;
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
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
    const untrackedFiles = untrackedOut.split('\x00').filter(Boolean);
    const patchPath = path.join(exportsDir, 'issue-' + issueNumber + '-' + ts + '.patch');
    const diff = execFileSync('git', ['-C', wtPath, 'diff', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
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

// #356: reject a leading-dash/NUL branch name so a malformed ref can't reach git as a flag.
function isSafeBranchArg(branch) {
  return typeof branch === 'string' && branch.length > 0 && !branch.startsWith('-') && !branch.includes('\0');
}

// #398.1: THROW-on-unsafe guard for branch CREATION sites (worktree add -b / checkout -b / patch).
function assertSafeBranchArg(branch, site) {
  if (!isSafeBranchArg(branch)) {
    throw new Error('refused: unsafe branch name' + (site ? ' at ' + site : '') +
      ': a branch beginning with "-" or carrying a NUL would be parsed by git as a flag/ref injection.');
  }
  assertNoNewline(branch, 'branch');
}

// #398.2: refuse a newline/CR in any durable-state field value (state-file field injection).
function assertNoNewline(value, fieldName) {
  if (typeof value === 'string' && /[\n\r]/.test(value)) {
    throw new Error('refused: ' + (fieldName || 'field') +
      ' contains a newline/CR — durable-state field injection. Provide a single-line value.');
  }
}

// #403.8: classify a raw worktree provisioning error into a stable single token.
function classifyWorktreeError(message) {
  const m = String(message || '');
  if (!m) return '';
  if (/already (exists|checked out|used by worktree)/i.test(m)) return 'already_exists';
  if (/not a valid (object name|ref)|unknown revision|invalid reference/i.test(m)) return 'invalid_ref';
  if (/permission denied|EACCES|read-only|EROFS/i.test(m)) return 'permission_denied';
  if (/no space left|ENOSPC|disk/i.test(m)) return 'disk_full';
  if (/not a git repository|fatal: this operation must be run in a work tree/i.test(m)) return 'not_a_repo';
  return 'unclassified';
}

function removeBranch(root, branch) {
  if (!isSafeBranchArg(branch)) return false;
  try {
    execFileSync('git', ['-C', root, 'branch', '-D', branch],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) {
    return false;
  }
}

// #620: is-ancestor-gated branch deletion — MIRRORS sink-merge.js's post-merge branch teardown
// (merge-base --is-ancestor proof before -D). cmdStaleWorktreeCleanup treats a closed-on-forge
// issue as stale even when its branch carries committed work that never merged into the default
// branch — worktreeDirtyState only checks *uncommitted* changes, so a committed-but-unmerged
// branch reads 'clean' — so the unconditional removeBranch() force-delete used by that loop
// permanently destroyed the ONLY copy of that work. This is a DISTINCT, opt-in-safe helper —
// removeBranch() itself is left untouched because cmdRelease (a user-consented discard/abandon)
// legitimately still needs its unconditional force-delete semantics. Prove ancestry into the
// resolved default branch first; `-D` only on that proof. Otherwise fall back to the SAFE
// `git branch -d` (git itself refuses to delete a genuinely unmerged branch); on refusal, do NOT
// destroy anything — report `skipped_unmerged` with the branch's tip SHA so an operator can
// recover it manually.
function removeBranchIfMerged(root, branch, defBranch) {
  if (!isSafeBranchArg(branch)) return { removed: false, mode: 'unsafe_branch_arg' };
  let mergedIntoDefault = false;
  if (defBranch) {
    try {
      execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', branch, defBranch],
        { stdio: ['ignore', 'ignore', 'ignore'] });
      mergedIntoDefault = true; // exit 0 → branch tip is an ancestor of defBranch (fully merged)
    } catch (_) { mergedIntoDefault = false; }
  }
  if (mergedIntoDefault) {
    try {
      execFileSync('git', ['-C', root, 'branch', '-D', branch], { stdio: ['ignore', 'ignore', 'ignore'] });
      return { removed: true, mode: 'forced' };
    } catch (_) { return { removed: false, mode: 'forced_failed' }; }
  }
  // Not provably merged into the resolved default branch — fall back to the SAFE delete, which git
  // itself refuses for genuinely unmerged work (never force through unproven ancestry).
  try {
    execFileSync('git', ['-C', root, 'branch', '-d', branch], { stdio: ['ignore', 'ignore', 'ignore'] });
    return { removed: true, mode: 'safe' };
  } catch (_) {
    let tip = null;
    try {
      tip = execFileSync('git', ['-C', root, 'rev-parse', branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (_) {}
    return { removed: false, mode: 'skipped_unmerged', tip };
  }
}

function extractIssueNumber(branch) {
  const m = String(branch || '').match(/^workflow\/gitea-issue-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function worktreeDirtyState(wtPath) {
  // #677 fail-closed: `fs.existsSync(wtPath)` returns false not only for a genuinely-absent path
  // but ALSO for a path that EXISTS whose PARENT directory is unreadable (chmod 000 / EACCES on an
  // ancestor) — the bare existsSync gate misrouted that second, genuinely-present case to
  // 'missing', feeding it straight to the same destructive prune-and-report-removed branch #672
  // already fail-closed for probe failures. Stat the path itself inside try/catch instead: only a
  // genuinely-absent path (ENOENT) is 'missing'; any other stat failure (EACCES/ENOTDIR on a
  // parent, ...) means the path could not be PROVEN absent, so it gets the existing 'unprobeable'
  // keep state — never a new state; both destructive consumers already keep it unconditionally.
  try {
    fs.lstatSync(wtPath);
  } catch (err) {
    return (err && err.code === 'ENOENT') ? 'missing' : 'unprobeable';
  }
  try {
    const out = execFileSync('git', ['-C', wtPath, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER });
    return out.trim().length > 0 ? 'dirty' : 'clean';
  } catch (_) {
    // #672 fail-closed: the path EXISTS but the probe itself failed (>maxBuffer porcelain, a
    // corrupted/broken git invocation, a transient lock, ...) — this must NEVER be read as
    // 'missing' (a destructive consumer treats 'missing' as prune-and-report-removed, silently
    // dropping git's tracking of real, possibly-dirty content that was merely unprobeable).
    // Report a distinct state every removal branch treats as KEEP.
    return 'unprobeable';
  }
}

function projectDir(root, project) {
  return path.join(root, 'kaola-workflow', project);
}

function stateFile(root, project) {
  return path.join(projectDir(root, project), 'workflow-state.md');
}

function writeFile(file, content) {
  // #353: crash-safe atomic replace for durable-state writes (a torn workflow-state.md is silently
  // skipped by readActiveFolders → project goes invisible). Falls back to a plain write if unavailable.
  if (adaptiveSchema && typeof adaptiveSchema.writeFileAtomicReplace === 'function') {
    adaptiveSchema.writeFileAtomicReplace(file, content);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function repositoryIdentity(root) {
  try {
    const remote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (remote) return remote;
  } catch (_) {}
  try {
    return 'local:' + fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
  } catch (_) {
    return 'local:' + path.resolve(root);
  }
}

// Capture claim identity exactly once. The returned scalar fields are persisted in
// workflow-state.md; the typed payload stays available to callers but is not serialized
// as ad-hoc JSON. The claim-root base commit/tree observation stood here too — it existed
// to anchor a re-plan epoch against the bytes the claim was authored over, and it went
// with the epoch machinery. Claim identity is what survives: it answers whose claim this
// is, which the durable claim record still needs.
function buildClaimAnchors(root, data) {
  const anchorRoot = fs.realpathSync(data.worktree_path || root);
  const issues = Array.isArray(data.issue_numbers) && data.issue_numbers.length
    ? data.issue_numbers : [data.issue_iid];
  const identity = adaptiveSchema.buildClaimIdentity({
    repository_id: repositoryIdentity(anchorRoot),
    issue_numbers: issues,
    primary_issue: data.issue_iid,
    bundle_id: data.bundle_id || null,
    closure_policy: data.closure_policy || 'all_or_nothing',
    branch: data.branch,
    worktree_path: anchorRoot,
    claim_ts: data.claim_ts,
    session_marker: data.session_marker,
  });
  return {
    claim_repository_id: identity.repository_id,
    claim_identity_digest: adaptiveSchema.sha256Canonical(identity),
    claim_identity: identity,
  };
}

function discoverProjectSafe() {
  try {
    return forge.discoverProject();
  } catch (_) {
    return {};
  }
}

function writeState(root, data) {
  // #398.2: refuse a newline/CR in any durable field value BEFORE serializing (field injection).
  assertNoNewline(data.branch, 'branch');
  assertNoNewline(data.worktree_path, 'worktree_path');
  assertNoNewline(data.base_branch, 'base_branch');
  assertNoNewline(data.pr_url, 'pr_url');
  // #603: same anti-injection guard as worktree_path for the persisted Codex dispatch mode (the
  // literal-value validation happens upstream at cmdStartup; this is the durable-field newline fence).
  assertNoNewline(data.codex_dispatch_mode, 'codex_dispatch_mode');
  // #579: liveness-marker guards.
  const computedMainRoot = resolveMainRoot(root);
  assertNoNewline(computedMainRoot, 'main_root');
  if (data.issue_iid == null) {
    const inferredIssue = /^issue-([1-9][0-9]*)$/.exec(String(data.project || ''));
    if (inferredIssue) data.issue_iid = parseInt(inferredIssue[1], 10);
  }
  const claimTs = data.claim_ts || new Date().toISOString();
  const sessionMarker = data.session_marker || resolveSessionMarker(process.env);
  data.claim_ts = claimTs;
  data.session_marker = sessionMarker;
  // Fresh claims have exactly one legal representation: schema-2 anchors
  // captured from immutable Git objects. Propagate any observation/validation
  // failure before workflow-state.md is written; missing-schema compatibility
  // belongs exclusively to the verified legacy re-plan import path.
  const claimAnchors = buildClaimAnchors(root, data);
  // issue #227/#770: adaptive is the ONLY workflow path — a fresh claim always scaffolds an
  // adaptive run that resumes through the next-work command (the fast/full paths and the
  // phaseN ladder were retired, and the path selector itself was retired by #770). A stale
  // non-adaptive workflow_path is tolerated on read but never scaffolded here — this field
  // is now a constant record, not a selection.
  const workflowPath = data.workflow_path || adaptiveSchema.ADAPTIVE_PATH;
  const adaptiveCommand = adaptiveSchema.NEXT_COMMAND + ' ' + data.project;
  const adaptiveSkill = adaptiveSchema.NEXT_SKILL + ' ' + data.project;
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + data.project,
    'status: ' + (data.status || 'active'),
    '',
    '## Current Position',
    'phase: adaptive',
    'phase_name: Adaptive',
    'workflow_path: ' + workflowPath,
    'runtime: ' + (data.runtime || 'claude'),
    'step: ' + (data.step || 'start'),
    'next_command: ' + (data.next_command || adaptiveCommand),
    'next_skill: ' + (data.next_skill || adaptiveSkill),
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
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
    'sink: ' + (data.sink || 'merge'),
    'run_posture: ' + deriveRunPosture(data.worktree_path),
    // #579 liveness-marker fields.
    'main_root: ' + computedMainRoot,
    'session_marker: ' + sessionMarker,
    'claim_ts: ' + claimTs
  ];
  if (data.worktree_path) lines.push('worktree_path: ' + data.worktree_path);
  // The durable anchor for the typed selection record — sha256 of the bytes
  // persisted at `<project>/.cache/origin/selection-record.json`. Written ONLY when the claim
  // carried one (every startup/pick-next-originated claim does, explicit-target included, via the
  // degenerate record); direct crash-reclaim callers stay byte-identical.
  if (data.selection_record_digest) lines.push('selection_record_digest: ' + data.selection_record_digest);
  // #603: persist the Codex dispatch mode so the adaptive dispatch cards read it at open time. Written
  // ONLY when present (flag absent → field absent). Post-#775 the persisted value is diagnostic-only — the effective mode is
  // always v2-task-name (resolveCodexDispatchMode ignores it); non-codex + un-flagged runs stay byte-identical.
  if (data.codex_dispatch_mode) lines.push('codex_dispatch_mode: ' + data.codex_dispatch_mode);
  if (data.worktree_error) {
    // #403.8: collapse the multi-line git error to one safe field + add the classified token.
    lines.push('worktree_error: ' + String(data.worktree_error).replace(/[\r\n]+/g, ' ').trim());
    const wec = data.worktree_error_class || classifyWorktreeError(data.worktree_error);
    if (wec) lines.push('worktree_error_class: ' + wec);
  }
  if (data.base_branch) lines.push('base_branch: ' + data.base_branch);
  if (data.pr_url) lines.push('pr_url: ' + data.pr_url);
  if (data.pr_number) lines.push('pr_number: ' + data.pr_number);
  // #328: bundle-only additive fields — ONLY written when present (single-issue path stays byte-identical)
  // #393a: emit issue_numbers ONLY for a TRUE bundle (length > 1) — single-issue stays byte-identical.
  if (Array.isArray(data.issue_numbers) && data.issue_numbers.length > 1) {
    lines.push('issue_numbers: ' + data.issue_numbers.join(','));
    lines.push('bundle_id: ' + data.bundle_id);
    lines.push('closure_policy: ' + (data.closure_policy || 'all_or_nothing'));
  }
  let stateContent = lines.join('\n') + '\n';
  stateContent = adaptiveSchema.writeClaimIdentityBlock(stateContent, claimAnchors);
  writeFile(stateFile(root, data.project), stateContent);
}

function updateState(root, project, updater) {
  const file = stateFile(root, project);
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) {}
  writeFile(file, updater(content));
}

function postAdvisoryClaim(issueIid, project, projectInfo) {
  // #356: return a truthful footprint status (posted|failed|skipped_offline) so a zero-footprint claim is visible.
  if (OFFLINE || issueIid == null) return 'skipped_offline';
  if (!projectInfo || !projectInfo.full_name) return 'failed';
  let labelAdded = false;
  try { forge.ensureLabel(projectInfo, { name: CLAIM_LABEL, color: '#e6b8a2' }); } catch (_) {}
  try { forge.updateIssueLabels(projectInfo, issueIid, { add: [CLAIM_LABEL] }); labelAdded = true; } catch (_) {}
  try {
    forge.createIssueComment(projectInfo, issueIid, '<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local Gitea work for `' + project + '`.');
  } catch (_) {}
  return labelAdded ? 'posted' : 'failed';
}

function clearAdvisoryClaim(issueIid, reason, projectInfo, project) {
  if (OFFLINE || issueIid == null) return 'skipped_offline';
  let status = 'failed';
  try {
    if (projectInfo && projectInfo.full_name) {
      forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] });
      status = 'removed';
    }
  } catch (_) {}
  try {
    if (reason && projectInfo && projectInfo.full_name) {
      forge.createIssueComment(projectInfo, issueIid, 'Kaola-Workflow advisory claim cleared: ' + reason);
    }
  } catch (_) {}
  // Delete the project-scoped kw:claim marker comment so the remote-claim detector
  // no longer blocks re-claiming this issue after discard/release/finalize (#278).
  try {
    const comments = forge.listIssueComments(projectInfo, issueIid);
    const marker = project ? ('<!-- kw:claim project=' + project + ' -->') : null;
    for (const comment of (Array.isArray(comments) ? comments : [])) {
      if (!comment || !comment.body || !comment.id) continue;
      if (marker ? comment.body.includes(marker) : /<!--\s*kw:claim\s+project=/.test(comment.body)) {
        try { forge.deleteIssueComment(projectInfo, issueIid, comment.id); } catch (_) {}
      }
    }
  } catch (_) {}
  return status;
}

function classifyIssue(root, issueIid) {
  try {
    return classifier.classifyIssue(issueIid, root);
  } catch (_) {
    return { verdict: 'target_unavailable', reasoning: 'classifier failed (Gitea)' };
  }
}

function activeByIssue(root, issueIid) {
  // #328: bundle-aware — also checks issue_numbers array for bundle membership
  return readActiveFolders(root).find(folder =>
    folder.issue_iid === issueIid ||
    (Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(issueIid))
  ) || null;
}

function activeByProject(root, project) {
  return readActiveFolders(root).find(folder => folder.project === project) || null;
}

// The consent ask raised when in-place branch creation would run over uncommitted work.
// Machines decide facts; humans decide values — and what happens to somebody's unstaged edits is
// theirs to decide, so this is a QUESTION with named options, not a verdict. Shared verbatim by
// the scalar and bundle claim paths so both editions of the ask say one thing.
function dirtyTreeConsentAsk(what) {
  return {
    result: 'consent',
    consent_kind: 'disambiguation',
    ask: 'The working tree has uncommitted changes and creating the ' + what
      + ' (KAOLA_WORKTREE_NATIVE=0) would carry them onto it. Commit them, stash them, or run in a '
      + 'worktree instead? Run `git status --porcelain` to see what is uncommitted. Nothing was '
      + 'written — no project folder, no branch, HEAD unmoved.',
    options: ['commit', 'stash', 'worktree'],
    reasoning: 'working tree has uncommitted changes; asking before creating the ' + what
      + ' (KAOLA_WORKTREE_NATIVE=0). Commit or stash, or use a worktree.',
  };
}

function readPriorityConfig(root) {
  const file = path.join(root, 'kaola-workflow', 'config.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.priority_top_tier_labels) ? parsed.priority_top_tier_labels : ['P0', 'P1'];
  } catch (_) { return ['P0', 'P1']; }
}

function priorityTier(issue, topTierLabels) {
  const labels = issue.labels || [];
  for (const label of labels) {
    if (/^P\d+$/i.test(label)) return { tier: parseInt(label.slice(1), 10), priority_label: label };
  }
  if (labels.some(label => topTierLabels.includes(label))) return { tier: 1, priority_label: labels.find(label => topTierLabels.includes(label)) };
  return { tier: 99, priority_label: '' };
}

function listOpenIssues(root) {
  try {
    const topTierLabels = readPriorityConfig(root);
    return forge.listIssues({ state: 'open', perPage: 100 })
      .filter(issue => issue.state === 'open')
      .sort((a, b) => {
        const at = priorityTier(a, topTierLabels).tier;
        const bt = priorityTier(b, topTierLabels).tier;
        return at - bt || Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number);
      });
  } catch (_) { return []; }
}

function claimProject(root, args) {
  const issueIid = args.issue || args.targetIssue || null;
  const project = args.project || projectNameForIssue(root, issueIid);
  assert(isSafeName(project), 'unsafe project name');
  const existing = issueIid != null ? activeByIssue(root, issueIid) : activeByProject(root, project);
  if (existing) return { status: 'owned', issue: existing.issue_iid, project: existing.project, folder: existing };

  // issue #770: the path selector is retired — adaptive is the only workflow path and there
  // is no legality gate left to run here. A stale KAOLA_PATH / --workflow-path request is
  // never refused; it silently runs adaptive (the claim's scaffolding is adaptive-only anyway).
  if (issueIid != null) {
    const probe = probeIssueState(issueIid);
    // The routing surfaces classify a NON-ACQUIRING claim by `result` alone, so this arm and the
    // `target_occupied` arm below have to carry one — both are already listed on those surfaces
    // under `result: refuse` and neither emitted the field. Each is a determinate fact about the
    // target (the issue is closed; a local folder already holds it), so `refuse` is the verb, not
    // the `answer` the demoted claim-time statuses carry.
    // MEASURED (on the GitHub canonical; this port shares the call graph): this arm's `result` is
    // authoritative, its EXIT CODE is not reached. `classifyIssue` returns verdict 'red' for a
    // closed issue and `claimExplicitTarget` answers on that verdict BEFORE it ever calls
    // `claimProject`, so the startup path cannot reach this line; `cmdClaim` is the only caller
    // that reaches it, and it calls `output()` with NO code argument, so the envelope always
    // exits 0 whatever `claimExitCode` computes. That makes
    // `claimExitCode('user_target_closed') === 1` unobservable today. Left as-is deliberately:
    // an exit code no shipped path emits cannot be verified by driving it. Consumers read `result`.
    if (probe.state === 'closed') {
      return { status: 'user_target_closed', result: 'refuse', issue: issueIid, project, reasoning: 'Gitea issue #' + issueIid + ' is closed' };
    }
    // #519: a TRANSIENT-infra probe fault is reported as such — a TLS timeout / rate-limit / DNS
    // blip must not be read as "target unavailable". Both arms ANSWER: nothing was written, and
    // the caller retries, goes offline, or picks another target on the strength of the reason.
    if (!OFFLINE && probe.state === 'unavailable' && probe.transient === true) {
      return { status: 'target_indeterminate', result: 'answer', claim: 'none', issue: issueIid, project,
        reasoning_class: 'classifier_error',
        reasoning: 'tea issue #' + issueIid + ' state probe transient fault (' + (probe.reason || 'transient') + '); retry when it clears' };
    }
    if (!OFFLINE && probe.state === 'unavailable') {
      return { status: 'target_unavailable', result: 'answer', claim: 'none', issue: issueIid, project, reasoning: 'tea issue #' + issueIid + ' state probe failed; not claiming outside KAOLA_WORKFLOW_OFFLINE=1' };
    }
  }

  // Hoist branch name computation before mkdir so the dirty-tree gate and in-place checkout block
  // can reference it without orphaning a created folder on refusal.
  const branch = buildBranchName(issueIid, project, args.branch);
  // #398.1: guard the resolved branch at the front door (before mkdir / worktree / checkout -b).
  assertSafeBranchArg(branch, 'claimProject');

  // Dirty tree: ASK, do not decide. The subject here is the USER'S OWN uncommitted work, and what
  // should happen to it is a value call — carrying it onto a feature branch, stashing it, or
  // leaving it where it is are all defensible and only its owner can pick. So this routes through
  // the consent valve as a question and stops with ZERO side effects; an UNPROBEABLE tree reads as
  // dirty (treeDirty fails closed), so an unverifiable tree asks rather than claiming over it.
  // Fires ONLY when NATIVE=0 (in-place mode), online, with git history, and HEAD not detached.
  // Detached HEAD does not ask — it falls to record-only below.
  const headBranch = inPlaceHead(root);
  const wouldInPlace = !OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE;
  if (wouldInPlace && headBranch !== 'HEAD' && headBranch !== '' && treeDirty(root, [project])) {
    return Object.assign({ status: 'dirty_tree_refused', claim: 'none', issue: issueIid, project },
      dirtyTreeConsentAsk('in-place feature branch'));
  }

  const dir = projectDir(root, project);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code === 'EEXIST') {
      if (fs.existsSync(stateFile(root, project))) {
        return { status: 'target_occupied', result: 'refuse', issue: issueIid, project, reasoning: 'local project folder exists' };
      }
      // orphaned stateless dir (crash between mkdir and writeState) — fall through and reclaim
    } else { throw e; }
  }

  let worktreePath = '';
  let worktreeError = '';
  const worktreeBranchExisted = branchExists(root, branch);
  // Worktree provisioning is ON by default. All workflow paths (full, fast, adaptive) provision a
  // repo-local hidden worktree at <root>/.kw/worktrees/<project> (#264). The executor (plan-run)
  // operates in the worktree via the ACTIVE_WORKTREE_PATH resolver, so adaptive runs now provision
  // per #264. Set KAOLA_WORKTREE_NATIVE=0 to opt out entirely.
  if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root)) {
    try { worktreePath = provisionWorktree(root, project, branch).path; } catch (_) { worktreeError = (_ && _.message) || String(_); }
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

  const projectInfo = discoverProjectSafe();
  try {
    // The record is written BEFORE the stamp that attests to it, inside this transaction, so a
    // failed write can never leave state asserting a digest for bytes that were never persisted.
    // A throw lands in the rollback below. Mirrors the canonical claim script.
    if (args.selectionRecordBytes) persistSelectionRecord(root, project, args.selectionRecordBytes);
    writeState(root, {
      project,
      issue_iid: issueIid,
      branch,
      sink: args.sink || process.env.KAOLA_SINK || 'merge',
      worktree_path: worktreePath,
      worktree_error: worktreeError,
      base_branch: baseBranch,
      // Adaptive is the ONLY workflow path, so this is a CONSTANT, never an echo of a request.
      // The retired KAOLA_PATH env var and --workflow-path flag are warn-and-ignore shims: they
      // cannot select, cannot refuse, and must leave no trace in durable state either. Keeping a
      // diagnostic echo of a retired selector only invited it to be misread as a live switch.
      // A legacy folder carrying a stale non-adaptive value is still tolerated on READ.
      workflow_path: adaptiveSchema.ADAPTIVE_PATH,
      runtime: args.runtime || 'claude',
      // #603: thread the pre-validated Codex dispatch mode into durable state (undefined when the flag
      // was absent → writeState omits the field).
      codex_dispatch_mode: args.codexDispatchMode,
      // The selection-record digest resolved BEFORE this claim ran (undefined for
      // direct crash-reclaim callers → writeState omits the field).
      selection_record_digest: args.selectionRecordDigest,
      status: 'active',
      full_name: projectInfo.full_name,
      project_html_url: projectInfo.html_url
    });
  } catch (error) {
    const rollbackWorktree = worktreePath || worktreePathFor(root, project);
    if (fs.existsSync(rollbackWorktree)) removeWorktree(root, project, { worktree_path: rollbackWorktree });
    if (!worktreeBranchExisted && branchExists(root, branch)) removeBranch(root, branch);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    throw error;
  }
  const remoteClaim = postAdvisoryClaim(issueIid, project, projectInfo); // #356: surface footprint status
  return Object.assign(
    { status: 'acquired', verdict: 'green', claim: 'acquired', issue: issueIid, project, branch, worktree_path: worktreePath, remote_claim: remoteClaim },
    // #403.8: classified worktree-error token alongside the raw message.
    worktreeError ? { worktree_error: worktreeError, worktree_error_class: classifyWorktreeError(worktreeError) } : {},
    baseBranch ? { base_branch: baseBranch } : {},
    inPlaceNote ? { inPlaceNote } : {}
  );
}

// #328: bundle-specific hard add-label. Unlike postAdvisoryClaim (which swallows all forge errors
// to be fire-and-forget), this helper THROWS on add-label failure so the claimBundle catch block
// can drive the all-or-nothing rollback. The issue comment is best-effort (after the hard label succeeds).
function addBundleLabel(issueIid, project) {
  if (OFFLINE || issueIid == null) return;
  const projectInfo = discoverProjectSafe();
  // Hard add-label: throws on failure — allows the claimBundle catch to drive rollback.
  forge.updateIssueLabels(projectInfo, issueIid, { add: [CLAIM_LABEL] });
  // Best-effort comment (never throws — rollback already can't undo a comment so
  // a hard throw here adds no correctness value and would orphan a REAL label).
  try {
    forge.createIssueComment(projectInfo, issueIid, '<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local Gitea work for `' + project + '`.');
  } catch (_) {}
}

// #328: bundle-specific hard remove-label for the rollback path. THROWS on remove-label failure
// so the claimBundle rollback loop can detect when teardown itself fails and return
// target_set_label_rollback_failed (rather than silently masking the teardown error).
// The best-effort comment + marker deletion are still fire-and-forget.
function removeBundleLabel(issueIid, project) {
  if (OFFLINE || issueIid == null) return;
  const projectInfo = discoverProjectSafe();
  // Hard remove-label: throws on failure so the rollback loop sets rollbackOk=false.
  forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] });
  // Best-effort: comment + delete the kw:claim marker comment (same as clearAdvisoryClaim).
  try {
    forge.createIssueComment(projectInfo, issueIid, 'Kaola-Workflow advisory claim cleared: bundle claim rolled back');
  } catch (_) {}
  try {
    const comments = forge.listIssueComments(projectInfo, issueIid);
    const marker = '<!-- kw:claim project=' + project + ' -->';
    for (const comment of (Array.isArray(comments) ? comments : [])) {
      if (!comment || !comment.body || !comment.id) continue;
      if (comment.body.includes(marker)) {
        try { forge.deleteIssueComment(projectInfo, issueIid, comment.id); } catch (_) {}
      }
    }
  } catch (_) {}
}

// #328: all-or-nothing bundle provision. Called by claimExplicitBundle after all validation
// passes. Mirrors claimProject's structure (mkdir -> worktree -> writeState -> per-issue labels)
// with a catch-block rollback that reverses every applied step in REVERSE order.
// Applied steps are tracked in `applied` for safe teardown.
function claimBundle(root, opts) {
  const { targets, project, branch } = opts;
  // #398.1: guard the bundle branch BEFORE any provisioning.
  assertSafeBranchArg(branch, 'claimBundle');
  // applied: track what was provisioned so rollback can undo exactly what succeeded
  const applied = { dir: false, worktree: false, worktreeAttempted: false, worktreePath: '', worktreeBranchExisted: false,
    labeled: [], inPlaceBranch: false, baseBranch: '' };

  // #370: bundle runs get the SAME provisioning hardening as single-issue claimProject, including
  // the consent ask about the user's uncommitted work — raised BEFORE any mutation so a dirty tree
  // never orphans a created folder. Mirrors claimProject.
  const headBranch = inPlaceHead(root);
  const wouldInPlace = !OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE;
  if (wouldInPlace && headBranch !== 'HEAD' && headBranch !== '' && treeDirty(root, [project])) {
    return Object.assign({ status: 'dirty_tree_refused', claim: 'none', issue: targets[0], issue_numbers: targets, project },
      dirtyTreeConsentAsk('in-place bundle feature branch'));
  }

  let claimErr = null;
  try {
    // Step 2: mkdir projectDir (EEXIST + stateFile present -> conflict)
    const dir = projectDir(root, project);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    try {
      fs.mkdirSync(dir);
    } catch (e) {
      if (e.code === 'EEXIST' && fs.existsSync(stateFile(root, project))) {
        // The routing surfaces classify a non-acquiring claim by `result` ALONE, so a status
        // token that carries `result` from one arm and nothing from another classifies two ways
        // depending on which internal arm fired — and nothing on the envelope names the arm.
        // This is the mid-provision arm of a token `claimExplicitBundle` also emits pre-mutation,
        // and `claimAnswer` is what makes both arms carry the same one. The `reasoning` string
        // still distinguishes them.
        return claimAnswer('target_set_conflicts_active_work', { issue: targets[0], project,
          reasoning: 'bundle project folder already exists: ' + project });
      } else if (e.code !== 'EEXIST') { throw e; }
    }
    applied.dir = true;

    // Step 3 (#370): provision a worktree exactly like claimProject — the prior "matches adaptive
    // single-issue" suppression was false (claimProject provisions for ALL paths incl. adaptive, #264).
    let worktreePath = '';
    let worktreeError = '';
    applied.worktreeBranchExisted = branchExists(root, branch);
    if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root)) {
      applied.worktreeAttempted = true;
      try {
        worktreePath = provisionWorktree(root, project, branch).path;
        applied.worktree = true;
        applied.worktreePath = worktreePath;
      } catch (e) { worktreeError = (e && e.message) || String(e); }
    }

    // In-place branch creation (NATIVE=0): create/checkout the bundle feature branch + record
    // base_branch so cmdRelease's #260 restore can run (the prior path recorded branch but never created it).
    let baseBranch = '';
    let inPlaceNote = '';
    if (wouldInPlace) {
      if (headBranch === 'HEAD' || headBranch === '') {
        inPlaceNote = 'detached HEAD: skipped in-place branch creation (record-only)';
      } else {
        try {
          const existedBefore = branchExists(root, branch);
          if (existedBefore) {
            execFileSync('git', ['-C', root, 'checkout', branch], { stdio: ['ignore', 'ignore', 'ignore'] });
          } else {
            execFileSync('git', ['-C', root, 'checkout', '-b', branch], { stdio: ['ignore', 'ignore', 'ignore'] });
          }
          baseBranch = (headBranch && headBranch !== 'HEAD' && headBranch !== branch) ? headBranch : '';
          applied.inPlaceBranch = !existedBefore;
          applied.baseBranch = baseBranch;
        } catch (e) {
          inPlaceNote = 'in-place branch checkout failed: ' + ((e && e.message) || String(e));
        }
      }
    }

    // Step 3b: the selection record, BEFORE the stamp that attests to it — same ordering and
    // same reason as the scalar claim. A throw lands in this function's rollback.
    if (opts.selectionRecordBytes) persistSelectionRecord(root, project, opts.selectionRecordBytes);

    // Step 4: writeState with primary + bundle fields (base_branch added per #370; writeState
    // derives run_posture from worktree_path).
    const projectInfo = discoverProjectSafe();
    writeState(root, {
      project,
      issue_iid: targets[0],
      issue_numbers: targets,
      bundle_id: project,
      closure_policy: 'all_or_nothing',
      branch,
      sink: opts.sink || 'merge',
      worktree_path: worktreePath,
      worktree_error: worktreeError,
      base_branch: baseBranch,
      workflow_path: 'adaptive',
      runtime: opts.runtime || 'claude',
      // #603: thread the pre-validated Codex dispatch mode (bundle path mirrors the scalar claim).
      codex_dispatch_mode: opts.codexDispatchMode,
      // The bundle lane is exactly the shape a no-target survey produces, so it
      // carries the same selection-record anchor as the scalar claim.
      selection_record_digest: opts.selectionRecordDigest,
      status: 'active',
      full_name: projectInfo.full_name,
      project_html_url: projectInfo.html_url
    });

    // Step 5: per-member hard add-label (addBundleLabel throws on add-label failure,
    // enabling the catch block to drive all-or-nothing rollback).
    // Track labeled members AFTER the hard label succeeds so rollback reverses exactly
    // what was applied.
    for (const n of targets) {
      addBundleLabel(n, project);
      applied.labeled.push(n);
    }

    return Object.assign({
      status: 'acquired',
      verdict: 'green',
      claim: 'acquired',
      issue: targets[0],
      issue_numbers: targets,
      project,
      bundle_id: project,
      branch,
      worktree_path: worktreePath
    },
    // #403.8: classified worktree-error token alongside the raw message (bundle path mirror).
    worktreeError ? { worktree_error: worktreeError, worktree_error_class: classifyWorktreeError(worktreeError) } : {},
    baseBranch ? { base_branch: baseBranch } : {},
    inPlaceNote ? { inPlaceNote } : {});
  } catch (err) {
    claimErr = err;
    // REVERSE-ORDER teardown
    let rollbackOk = true;
    // a. Clear labels/comments for each already-labeled member (reverse order).
    //    Use removeBundleLabel (hard, throws on remove-label failure) instead of
    //    clearAdvisoryClaim (which swallows all errors) so that a teardown failure
    //    sets rollbackOk=false and returns target_set_label_rollback_failed.
    for (const n of applied.labeled.slice().reverse()) {
      try {
        removeBundleLabel(n, project);
      } catch (_) {
        rollbackOk = false;
      }
    }
    // b. Remove worktree if provisioned
    if (applied.worktree || applied.worktreeAttempted) {
      try {
        const rollbackWorktree = applied.worktreePath || worktreePathFor(root, project);
        if (fs.existsSync(rollbackWorktree)) removeWorktree(root, project, { worktree_path: rollbackWorktree });
        if (!applied.worktreeBranchExisted && branchExists(root, branch)) removeBranch(root, branch);
      } catch (_) {
        rollbackOk = false;
      }
    }
    // b2. (#370) Restore the in-place branch we created: checkout the base (or default) and delete
    //     the bundle branch, so an all-or-nothing rollback leaves no orphan feature branch.
    if (applied.inPlaceBranch) {
      try {
        const target = applied.baseBranch || defaultBranch(root);
        execFileSync('git', ['-C', root, 'checkout', target], { stdio: ['ignore', 'ignore', 'ignore'] });
        execFileSync('git', ['-C', root, 'branch', '-D', branch], { stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (_) {
        rollbackOk = false;
      }
    }
    // c. Remove project dir if created
    if (applied.dir) {
      try {
        const dir = projectDir(root, project);
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {
        rollbackOk = false;
      }
    }
    if (!rollbackOk) {
      // The one token on this surface with no scalar twin, because there is no scalar analogue of
      // "the unwind itself failed": a claim label the rollback could not remove OUTLIVES this
      // answer. `partial` is the applied-step record a human needs to finish the cleanup by hand.
      return claimAnswer('target_set_label_rollback_failed', {
        issue_numbers: targets,
        project,
        reasoning: 'partial claim could not be fully rolled back; manual cleanup may be required',
        partial: applied
      });
    }
    return claimAnswer('target_set_unavailable', {
      issue_numbers: targets,
      project,
      reasoning: 'bundle provision failed and was rolled back: ' + ((claimErr && claimErr.message) || String(claimErr))
    });
  }
}

// #328: the bundle analog of claimExplicitTarget — validates every member (steps 1-4 from design.md)
// before any mutation, then delegates provisioning to claimBundle (step 5-6).
// Bundle size is not capped: the count rides out as advice, never as a refusal.
function claimExplicitBundle(root, args) {
  const targets = args.targetIssues;
  // Step 0 (#370): refuse malformed tokens (echo the offender) BEFORE the empty check.
  if (Array.isArray(args.targetIssuesInvalidTokens) && args.targetIssuesInvalidTokens.length) {
    return claimAnswer('target_set_invalid_token', { claim: 'none', project: null, issue: null,
      reasoning: '--target-issues contains invalid token(s): ' + args.targetIssuesInvalidTokens.join(', ') +
        ' — each target must be a positive integer' });
  }
  // Step 1: empty/missing
  if (!Array.isArray(targets) || targets.length === 0) {
    return claimAnswer('target_set_empty', { claim: 'none', project: null, issue: null,
      reasoning: '--target-issues <A,B,...> required' });
  }
  // Step 2: bundle size is SHAPE, and shape is the orchestrator's to decide — how many issues one
  // claim takes is a judgement about the work, not a fact a script can get right. Nothing is
  // enforced here: the count and a recommended ceiling ride out as ADVICE on the emitted envelope,
  // and an orchestrator that wants a wider bundle simply takes one. KAOLA_BUNDLE_MAX_ISSUES went
  // with the enforcement rather than staying as a knob that tunes a limit nothing applies.
  const BUNDLE_SIZE_ADVISORY = 8;
  const sizeAdvice = targets.length > BUNDLE_SIZE_ADVISORY
    ? { bundle_size_note: 'bundle of ' + targets.length + ' issues; ' + BUNDLE_SIZE_ADVISORY
        + ' or fewer is the recommended shape for one plan. Advice only — nothing was capped.' }
    : null;
  // issue #770: the path selector is retired — the bundle lane always runs adaptive now, so
  // there is no separate "adaptive-only" legality question left to gate here.
  // Step 4: per-issue validation loop (NO mutation yet)
  for (const n of targets) {
    // 4a: check active folders (bundle-aware activeByIssue)
    const existing = activeByIssue(root, n);
    if (existing) {
      return claimAnswer('target_set_conflicts_active_work', { claim: 'none', issue: n,
        reasoning: '#' + n + ' is already claimed by project ' + existing.project });
    }
    // 4b: probe issue state FIRST so a closed member gets the dedicated code before
    //     the classifier (which returns verdict:'red' for closed issues, causing it to
    //     be unreachable if probe runs after classify).
    const probe = probeIssueState(n);
    if (probe.state === 'closed') {
      return claimAnswer('target_set_has_closed_issue', { claim: 'none', issue: n,
        reasoning: '#' + n + ' is closed' });
    }
    // #519: a TRANSIENT-infra probe fault escalates the whole bundle instead of refusing on a TLS
    // timeout / rate-limit / DNS blip (reaches the existing target_set_indeterminate/escalate valve).
    if (!OFFLINE && probe.state === 'unavailable' && probe.transient === true) {
      return claimAnswer('target_set_indeterminate', { claim: 'none', issue: n,
        reasoning_class: 'classifier_error',
        reasoning: '#' + n + ' state probe transient fault (' + (probe.reason || 'transient') + '); escalate to retry' });
    }
    if (!OFFLINE && probe.state === 'unavailable') {
      return claimAnswer('target_set_unavailable', { claim: 'none', issue: n,
        reasoning: '#' + n + ' state probe failed' });
    }
    // 4c: classify
    const classified = classifyIssue(root, n);
    if (classified.verdict === 'owned' || classified.verdict === 'blocked') {
      return claimAnswer('target_set_conflicts_active_work', { claim: 'none', issue: n,
        reasoning: classified.reasoning });
    }
    if (classified.verdict === 'red') {
      return claimAnswer('target_set_red', { claim: 'none', issue: n, reasoning: classified.reasoning });
    }
    if (classified.verdict === 'target_unavailable') {
      return claimAnswer('target_set_unavailable', { claim: 'none', issue: n, reasoning: classified.reasoning });
    }
    if (classified.verdict === 'target_unverified') {
      return claimAnswer('target_set_unverified', { claim: 'none', issue: n, reasoning: classified.reasoning });
    }
    // #519: the forge classifier now partitions a tea fetch fault by stderr ERROR-CLASS — a
    // transient-infra fault (TLS timeout / rate-limit / DNS) surfaces 'indeterminate' (mirroring
    // root), which this arm routes to result:escalate (a genuine-negative stays target_unavailable).
    if (classified.verdict === 'indeterminate') {
      return claimAnswer('target_set_indeterminate', {
        claim: 'none',
        issue: n,
        reasoning_class: classified.reasoning_class || 'classifier_error',
        reasoning: classified.reasoning
      });
    }
  }
  // Step 5: derive project/branch — design §Naming: bundle_id = 'bundle-' + sorted targets
  const project = 'bundle-' + targets.join('-');
  const branch = buildBranchName(null, project, args.branch);
  // Step 5-6: all-or-nothing provision
  const claimed = claimBundle(root, {
    targets,
    project,
    branch,
    sink: args.sink || process.env.KAOLA_SINK || 'merge',
    runtime: args.runtime || 'claude',
    selectionRecordDigest: args.selectionRecordDigest, // the selection record's durable anchor
    selectionRecordBytes: args.selectionRecordBytes    // ...and the bytes it is a digest OF
  });
  // Advice rides the envelope the claim actually emits; it never changes the outcome.
  return sizeAdvice ? Object.assign(claimed, sizeAdvice) : claimed;
}

// ---------------------------------------------------------------------------
// The selection record — evidence, not a door.
//
// Selection is ORCHESTRATOR-owned: the origin phase may dispatch read-only agents and ask the user
// before anything is claimed, and what it decided is worth keeping. So the record is PERSISTED and
// DIGESTED on every claim, and that is the whole of the mechanism.
//
// It does not refuse, and there is nothing here that can. Claiming is bookkeeping — an agent that
// should not hold this claim re-states its reason and claims something else — so a commitment point
// that would not proceed is a stop nobody can act on. What the caller supplied is REPORTED on the
// emitted envelope (`selection_record_note`) and the claim proceeds:
//   * no record supplied      -> the canonical self-describing record is synthesized and persisted.
//   * path absent/unreadable  -> same, and the note names the path that would not read.
//   * bytes that will not parse as a JSON object -> same, and the note says so.
// A record that DOES parse is persisted byte-for-byte and never graded: its fields carry the
// orchestrator's REASONING, and a script that graded reasoning would be re-deciding the thing the
// agent already decided. Byte-through is a real property of the persist, so it is the one thing
// this code still checks for.
// ---------------------------------------------------------------------------
const SELECTION_RECORD_RELPATH = path.join('.cache', 'origin', 'selection-record.json');
const ORIGIN_STAGING_DIRNAME = '.origin';

// The canonical, self-describing record. Every field says WHY it holds nothing rather than holding
// nothing, which is what makes a later reader able to tell "no record was authored" apart from
// "the record was lost". It is what a claim carrying no usable record persists.
function buildDegenerateSelectionRecord(label, mode) {
  const target = String(label || 'none').trim() || 'none';
  const why = String(mode || 'explicit-target').trim() || 'explicit-target';
  return {
    selection_mode: why,
    selection_bundle: target,
    selection_priority_basis: 'none recorded (' + why + '); the caller named ' + target
      + ', and no backlog ranking was persisted',
    selection_rejected: 'none recorded (' + why + '); no alternatives were persisted',
    selection_disjointness: 'none recorded (' + why + '); the claim itself is the disjointness check',
    clarifications: 'none',
  };
}

function serializeSelectionRecord(record) {
  return JSON.stringify(record, null, 2) + '\n';
}

function digestSelectionRecord(bytes) {
  return require('crypto').createHash('sha256').update(String(bytes), 'utf8').digest('hex');
}

// One wording for what the substitution means, shared by all three arms below. It has to hold on
// BOTH claim outcomes: completeSelectionOrigin persists nothing unless the claim ACQUIRED, so a
// past-tense "was written" would be false on exactly the non-acquiring path the planner profiles
// tell an agent to surface.
const NONE_RECORDED_SUBSTITUTION = 'the canonical "none recorded" record stands in its place — it '
  + 'is what selection_record_digest covers, and it is what gets persisted if this claim acquires.';

// Resolve the record to persist, with ZERO side effects and no way to refuse.
// Returns { bytes, digest } and, when nothing usable was supplied, a `note` naming what was found.
// `label` names the resolved target(s) for the synthesized record.
function resolveSelectionRecord(args, label) {
  // Anything that is not the exact literal 'user_directed' is read as orchestrator-originated,
  // including a typo — the reading is deliberately the strict one, but it decides only which
  // canonical record gets synthesized, never whether the claim proceeds.
  const targetSource = String(args.targetSource == null ? 'user_directed' : args.targetSource).trim();
  const orchestratorSelected = targetSource !== 'user_directed';
  const recordPath = args.selectionRecord == null ? '' : String(args.selectionRecord).trim();
  const synthesize = (mode, note) => {
    const bytes = serializeSelectionRecord(buildDegenerateSelectionRecord(label, mode));
    return note
      ? { bytes, digest: digestSelectionRecord(bytes), note }
      : { bytes, digest: digestSelectionRecord(bytes) };
  };

  if (!recordPath) {
    if (orchestratorSelected) {
      return synthesize('none-recorded',
        '--target-source ' + targetSource + ' declares a no-target-originated claim and no '
        + '--selection-record <path> came with it, so ' + NONE_RECORDED_SUBSTITUTION
        + ' Author one and re-claim if the reasoning is worth keeping.');
    }
    return synthesize('explicit-target');
  }

  let raw;
  try {
    raw = fs.readFileSync(recordPath, 'utf8');
  } catch (e) {
    return synthesize('none-recorded',
      '--selection-record ' + recordPath + ' is absent or unreadable ('
      + ((e && e.code) || (e && e.message) || 'unreadable')
      + '); ' + NONE_RECORDED_SUBSTITUTION);
  }

  let record = null;
  try { record = JSON.parse(raw); } catch (_) { record = null; }
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    // The one property this still checks, because it is a real property of the byte-through
    // persist rather than a judgement about content: bytes that will not parse cannot be a
    // record a later reader can use.
    return synthesize('none-recorded',
      '--selection-record ' + recordPath + ' is not a JSON object; ' + NONE_RECORDED_SUBSTITUTION);
  }
  // Byte-through: the orchestrator's OWN wording is the record. Re-serializing it here would turn
  // an authored rationale into a normalized stub, and grading its fields would re-decide the
  // selection the agent already made.
  return { bytes: raw, digest: digestSelectionRecord(raw) };
}

function selectionRecordPath(root, project) {
  return path.join(projectDir(root, project), SELECTION_RECORD_RELPATH);
}

function persistSelectionRecord(root, project, bytes) {
  const dest = selectionRecordPath(root, project);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  writeFile(dest, bytes);
  return dest;
}

// B1: pre-claim reconnaissance has no durable home — the project folder does not exist until the
// claim creates it — so the origin phase stages findings under
// `kaola-workflow/.origin/<target-key>/`, where <target-key> is the PROJECT NAME the claim will
// resolve to. This folds that subtree into `<project>/.cache/origin/` (relative layout preserved)
// and REMOVES the staging dir, so evidence lands in durable files instead of run context.
// Absent staging is a clean no-op, and the fold NEVER blocks the claim.
function foldOriginStaging(root, project) {
  const originRoot = path.join(root, 'kaola-workflow', ORIGIN_STAGING_DIRNAME);
  const staging = path.join(originRoot, project);
  try {
    if (!fs.existsSync(staging) || !fs.statSync(staging).isDirectory()) return false;
    copyDir(staging, path.join(projectDir(root, project), '.cache', 'origin'));
    fs.rmSync(staging, { recursive: true, force: true });
    // Leave no empty staging root behind — an inert `.origin/` reads as "recon pending".
    try { if (fs.readdirSync(originRoot).length === 0) fs.rmdirSync(originRoot); } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
}

// Called on EVERY acquiring startup/pick-next claim, scalar and bundle alike: fold the staged
// evidence first, then persist the gate-validated record over it (the record is the authority, so
// a staged file of the same name never wins), then surface the digest on the emitted claim JSON.
function completeSelectionOrigin(root, result, gate) {
  if (!result || result.status !== 'acquired' || !result.project || !gate || !gate.bytes) return result;
  try { foldOriginStaging(root, result.project); } catch (_) {}
  result.selection_record_digest = gate.digest;
  return result;
}

// Every arm below ANSWERS. The classifier's verdict rides on the envelope with `claim: 'none'` so
// the caller knows exactly what was found and can act — re-state the reason and claim another
// issue, go offline, retry, or ask the user. None of it is a fact about a kernel write, and a
// classifier that would not answer is not the target failing a test.
function claimExplicitTarget(root, args) {
  const targetIssue = args.targetIssue || args.issue;
  if (!Number.isFinite(targetIssue) || targetIssue <= 0) {
    return { status: 'no_target', result: 'answer', claim: 'none', project: null, issue: null, reasoning: '--target-issue <N> required' };
  }
  const classified = classifyIssue(root, targetIssue);
  if (classified.verdict === 'blocked') {
    return { status: 'user_target_blocked', result: 'answer', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'red') {
    return { status: 'user_target_red', result: 'answer', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'target_unavailable') {
    return { status: 'target_unavailable', result: 'answer', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'target_unverified') {
    return {
      status: 'target_unverified',
      result: 'answer',
      claim: 'none',
      issue: targetIssue,
      project: projectNameForIssue(root, targetIssue),
      reasoning: classified.reasoning
    };
  }
  // #519: the forge classifier now partitions a tea fetch fault by stderr ERROR-CLASS — a
  // transient-infra fault (TLS timeout / rate-limit / DNS) surfaces 'indeterminate' (mirroring
  // root), which this arm routes to result:escalate (a genuine-negative stays target_unavailable).
  if (classified.verdict === 'indeterminate') {
    return {
      status: 'target_indeterminate',
      result: 'answer',
      claim: 'none',
      issue: targetIssue,
      project: projectNameForIssue(root, targetIssue),
      reasoning_class: classified.reasoning_class || 'classifier_error',
      reasoning: classified.reasoning
    };
  }
  return claimProject(root, Object.assign({}, args, { issue: targetIssue, project: args.project || projectNameForIssue(root, targetIssue) }));
}

function output(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  if (code) process.exitCode = code;
}

// One wording for the no-target usage answer, shared by startup and pick-next.
const NO_TARGET_USAGE = 'usage: --target-issue <N> (or --target-issues A,B,C) required; '
  + 'the workflow never auto-picks an issue.';
// The `result` every SCALAR claim-time status carries. This is the ONE authored half of the
// vocabulary; the bundle half below is derived from it and is never authored separately. Keep it
// that way — a second list of the same statuses maintained beside this one is the exact failure
// this map exists to prevent, because a token added to one copy and not the other diverges
// silently and no test can catch it (nothing would read the second copy).
const CLAIM_SCALAR_RESULTS = Object.freeze({
  no_target: 'answer',
  target_ambiguity: 'answer',
  user_target_blocked: 'answer',
  user_target_red: 'answer',
  target_unavailable: 'answer',
  target_unverified: 'answer',
  target_indeterminate: 'answer',
  target_occupied: 'refuse',
  user_target_closed: 'refuse',
  dirty_tree_refused: 'consent',
});

// THE RULE: a `target_set_X` classifies and exits exactly like its scalar twin `X`.
//
// The bundle lane reports the same fact about a SET that the scalar lane reports about one issue,
// and a fact does not change its meaning — or its exit code — because it was asked about three
// issues instead of one. One statable rule, no per-token judgement. The map is the single source:
// `result` and the exit code are both DERIVED from the twin, so a new bundle token cannot be added
// to one half only, and a token cannot carry one classification at one emission site and a
// different one at another.
//
// `twin: null` means the rule is SILENT — the token has no scalar counterpart, so the conservative
// reading governs and the `result` is authored here instead. There is exactly one such token, and
// it is the only code on this surface where a forge mutation SURVIVES the answer (a claim label
// that could not be removed), so the "nothing was written" argument above does not reach it.
//
// `route` replaces the twin's `result` with a strictly MORE specific non-stopping answer, never
// with a stop: `escalate` says "act on this by asking the user" where `answer` says "act on it
// yourself". It does not change the exit code.
const TARGET_SET_TWINS = Object.freeze({
  target_set_empty:                 Object.freeze({ twin: 'no_target' }),
  target_set_invalid_token:         Object.freeze({ twin: 'no_target' }),
  target_set_red:                   Object.freeze({ twin: 'user_target_red' }),
  target_set_unavailable:           Object.freeze({ twin: 'target_unavailable' }),
  target_set_unverified:            Object.freeze({ twin: 'target_unverified' }),
  target_set_indeterminate:         Object.freeze({ twin: 'target_indeterminate', route: 'escalate' }),
  target_set_conflicts_active_work: Object.freeze({ twin: 'target_occupied' }),
  target_set_has_closed_issue:      Object.freeze({ twin: 'user_target_closed' }),
  target_set_label_rollback_failed: Object.freeze({ twin: null, result: 'refuse' }),
});

// The `result` for any claim-time status, scalar or bundle. Returns null for a status outside the
// vocabulary — callers treat that as unknown, never as an answer.
function claimResult(status) {
  if (Object.prototype.hasOwnProperty.call(CLAIM_SCALAR_RESULTS, status)) return CLAIM_SCALAR_RESULTS[status];
  const entry = TARGET_SET_TWINS[status];
  if (!entry) return null;
  if (entry.route) return entry.route;
  if (entry.twin === null) return entry.result;
  return CLAIM_SCALAR_RESULTS[entry.twin] || null;
}

// Build a non-acquiring claim envelope whose `result` comes from the map, never from the site.
function claimAnswer(status, extra) {
  return Object.assign({ status, result: claimResult(status) }, extra);
}

// The exit code follows `result`, and `result` follows the twin. At this surface the exit code no
// longer classifies — it only separates the answers a caller acts on from the two stops it must
// not walk past: `consent`, which is a human fence, and `refuse`, which survives exactly where the
// scalar twin already refuses or where a forge mutation outlived the answer. An unrecognised
// status keeps the historical fail-closed non-zero.
function claimExitCode(status) {
  if (status === 'acquired' || status === 'owned') return 0;
  const result = claimResult(status);
  if (result === null) return 1;
  return (result === 'refuse' || result === 'consent') ? 1 : 0;
}

function cmdClaim() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  output(claimProject(root, args));
}

// issue #235 (audit D8): the /kaola-workflow-adapt authoring entry. #538: adaptive is the
// unconditional default — there is no switch to be OFF — so authoring is ALWAYS allowed; the
// subcommand stays registered and returns the allow envelope, it simply never refuses. Forge-neutral
// + stateless so the body is byte-identical across all four editions. The validator stays toggle-agnostic.
function cmdAuthoringAllowed() {
  const args = parseArgs(process.argv.slice(3));
  output({ status: 'authoring_allowed', allowed: true, project: args.project || null });
}

function cmdStartup() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const scalarTarget = args.targetIssue || args.issue;
  const bundleTargets = Array.isArray(args.targetIssues) && args.targetIssues.length ? args.targetIssues : null;

  // #328: both scalar and bundle set — an argv usage answer, never a gate. Nothing is written
  // either way, and the caller re-runs with one of the two.
  if (scalarTarget && bundleTargets) {
    output({ verdict: 'target_ambiguity', claim: 'none', project: null, issue: null,
      status: 'target_ambiguity', result: 'answer',
      reasoning: 'usage: both --target-issue and --target-issues are set; pass exactly one.' },
      claimExitCode('target_ambiguity'));
    return;
  }

  // #775: --codex-dispatch-mode is retired to a WARN-AND-IGNORE shim (v2-task-name is the only
  // mode) — never a refusal, never persisted. Strip it from `args` BEFORE the scalar/bundle claim
  // paths below so codex_dispatch_mode is never written into durable state from this flag.
  if (resolveCodexDispatchModeFlag(args).present) {
    process.stderr.write(CODEX_DISPATCH_MODE_IGNORED_NOTE + '\n');
    delete args.codexDispatchMode;
  }

  // The selection record, resolved BEFORE any claim mutation so the digest is available to
  // writeState. It cannot refuse: whatever the caller supplied (or did not) is reported on the
  // emitted envelope as `selection_record_note` and the claim proceeds.
  const selectionLabel = bundleTargets
    ? bundleTargets.map(n => '#' + n).join(', ')
    : (scalarTarget ? '#' + scalarTarget : 'none');
  const selectionRecord = resolveSelectionRecord(args, selectionLabel);
  const recordNote = selectionRecord.note ? { selection_record_note: selectionRecord.note } : {};
  args.selectionRecordDigest = selectionRecord.digest;
  args.selectionRecordBytes = selectionRecord.bytes;
  // The emitted `target_source` is a RECORD of how this claim originated, so it echoes the
  // discriminator the record resolver just read rather than the historical constant. It mirrors
  // that resolver's strict reading: anything that is not the exact 'user_directed' literal is
  // recorded as orchestrator-originated.
  const resolvedTargetSource = String(args.targetSource == null ? 'user_directed' : args.targetSource).trim()
    === 'user_directed' ? 'user_directed' : 'orchestrator_selected';

  // #328: bundle path
  if (bundleTargets) {
    const result = claimExplicitBundle(root, args);
    // Fold the staged origin evidence + persist the resolved record under the claimed bundle
    // project, then surface its digest on the emitted claim JSON.
    completeSelectionOrigin(root, result, selectionRecord);
    output(Object.assign({
      verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
      claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
      selected_project: result.project || null,
      selected_issue: result.issue || null,
      target_source: resolvedTargetSource,
      worktree_path: result.worktree_path || ''
    }, result, recordNote), claimExitCode(result.status));
    return;
  }

  // MEASURED, and left alone: this surface is INCONSISTENT about which key carries the token.
  // This answer (and its `cmdPickNext` twin) emits a bare `verdict` with NO `status` key at all,
  // while every arm composed through the Object.assign below carries BOTH `verdict` and `status`.
  // A consumer — or a check — comparing `envelope.status` across the two shapes compares
  // `undefined` to `undefined` on this one and reads it as agreement, which is how the gap stayed
  // invisible. `verdict` and `result` are both correct here; only the missing `status` is the
  // defect. Normalizing it is a breaking envelope change for anything keyed on the current shape,
  // so it is recorded rather than fixed.
  if (!scalarTarget) {
    output({ verdict: 'no_target', claim: 'none', project: null, issue: null, result: 'answer',
      reasoning: NO_TARGET_USAGE }, claimExitCode('no_target'));
    return;
  }
  const result = claimExplicitTarget(root, Object.assign({}, args, { targetIssue: scalarTarget }));
  // Fold the staged origin evidence + persist the resolved record under the claimed project, then
  // surface its digest on the emitted claim JSON.
  completeSelectionOrigin(root, result, selectionRecord);
  output(Object.assign({
    verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
    claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
    selected_project: result.project || null,
    selected_issue: result.issue || null,
    target_source: resolvedTargetSource,
    worktree_path: result.folder ? (result.folder.worktree_path || '') : (result.worktree_path || '')
  }, result, recordNote), claimExitCode(result.status));
}

function cmdPickNext() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const target = args.targetIssue || args.issue;
  // #328: bundle path — delegate to cmdStartup which handles both scalar and bundle
  if (target || (Array.isArray(args.targetIssues) && args.targetIssues.length)) return cmdStartup();
  output({ verdict: 'no_target', claim: 'none', project: null, issue: null, result: 'answer',
    reasoning: NO_TARGET_USAGE }, claimExitCode('no_target'));
}

function resumeFallbackCommand(root, folder) {
  // issue #227: adaptive is the only workflow path — resume routes to the next-work command
  // (the fast/full paths and the phaseN ladder were retired). reconcileNextCommand trusts a
  // legacy project's persisted next_command first, so this fallback only fires when no
  // command was persisted.
  return adaptiveSchema.NEXT_COMMAND + ' ' + folder.project;
}

// #234 E1: reconcile the persisted next_command against the project's true path before trusting it.
// Adaptive (state field or a workflow-plan.md) -> FORCE plan-run, ignore a stale phaseN. Adaptive is
// the only path now, but a legacy non-adaptive folder is still tolerated on read: it keeps its
// pre-existing contract (trust the persisted command, else fall back to plan-run via
// resumeFallbackCommand). Toggle-agnostic.
function reconcileNextCommand(root, folder) {
  let content = '';
  try {
    content = fs.readFileSync(path.join(root, 'kaola-workflow', folder.project, 'workflow-state.md'), 'utf8');
  } catch (_) {}
  const recordExists = fs.existsSync(path.join(root, 'kaola-workflow', folder.project, adaptiveSchema.MISSION_LIST_FILE))
    || fs.existsSync(path.join(root, 'kaola-workflow', folder.project, adaptiveSchema.PLAN_FILE));
  const isAdaptive = /^(?:workflow_path|phase):\s*adaptive\s*$/m.test(content) || recordExists;
  if (isAdaptive) return adaptiveSchema.NEXT_COMMAND + ' ' + folder.project;
  return folder.next_command || resumeFallbackCommand(root, folder);
}

// Detect the crash state where archiveProjectDir ran but the implementation commit was
// not made yet. Pure read — no mutations. Returns:
//   { incomplete: true,  reason: 'archived_impl_uncommitted', locus, archive_dir }  — crash state, resumable
//   { incomplete: false, reason: 'already_finalized', locus, archive_dir }          — clean, nothing to resume
//   null                                                                             — archive dir absent, not applicable
// `locus` names WHICH of the two structurally different proofs fired — `local` (this root's own
// archive dir is present, and git says it is committed) or `main_resident` (the archive lives in
// the MAIN root and this branch no longer carries the live folder). Both reach the same word; only
// one of them also means the sink ran, so a consumer that cannot tell them apart is guessing.
// `archive_dir` is the directory the verdict was actually proved against, which for a
// `main_resident` answer is NOT under `root`.
function archiveDirDirty(root, project) {
  // #563: an UNPROBEABLE tree fails CLOSED = treated as DIRTY (mirror #557/#496/#552). A swallowed probe
  // fault here would mis-report a crashed finalize (archived-but-uncommitted) as already_finalized,
  // skipping the resume. Treating an unverifiable tree as dirty yields incomplete:true → finalize
  // --keep-worktree resumes, rather than falsely declaring the work safely committed.
  try {
    const out = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', path.join('kaola-workflow', 'archive', project)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
    return out.trim().length > 0;
  } catch (_) { return true; }
}
function detectFinalizeIncomplete(root, project) {
  if (!project) return null;
  const archiveDir = path.join(root, 'kaola-workflow', 'archive', project);
  if (fs.existsSync(archiveDir)) {
    if (archiveDirDirty(root, project)) {
      return { incomplete: true, reason: 'archived_impl_uncommitted', locus: 'local', archive_dir: archiveDir };
    }
    return { incomplete: false, reason: 'already_finalized', locus: 'local', archive_dir: archiveDir };
  }
  // #832: the archive resolves against MAIN's project root, so a resume invoked from a LINKED
  // worktree finds nothing locally even though the run finalized. Main's copy is deliberately
  // UNTRACKED there until the sink's archive_commit step lands it, so its git-dirty state says
  // nothing about this worktree's transaction — probe the property that does: the branch still
  // carrying the live folder means the transaction's own `chore: archive` commit (which removes it)
  // never landed, so the finalize is resumable. Otherwise the worktree side is settled and the
  // archive commit belongs to the sink, not to a re-run of finalize.
  try {
    const main = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    if (path.resolve(main) === path.resolve(root)) return null;
    const mainArchiveDir = path.join(main, 'kaola-workflow', 'archive', project);
    if (!fs.existsSync(mainArchiveDir)) return null;
    const liveRef = 'HEAD:kaola-workflow/' + project + '/workflow-state.md';
    try {
      execFileSync('git', ['-C', root, 'cat-file', '-e', liveRef], { stdio: ['ignore', 'ignore', 'ignore'] });
      return { incomplete: true, reason: 'archived_impl_uncommitted', locus: 'main_resident', archive_dir: mainArchiveDir };
    } catch (_) { /* not on the branch — the archive commit landed (or the folder was never tracked) */ }
    return { incomplete: false, reason: 'already_finalized', locus: 'main_resident', archive_dir: mainArchiveDir };
  } catch (_) { return null; }
}

function cmdResume() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  // #503: refuse silently picking folder[0] when multiple active folders exist and --project is absent.
  // Scripts validate+claim, never select under ambiguity (#44).
  // #579: if exactly ONE classifies as 'mine', auto-select it (co-tenant doesn't produce false ambiguity).
  if (!args.project) {
    const active = readActiveFolders(root);
    if (active.length > 1) {
      const ctx = {
        ownSession: resolveSessionMarker(process.env),
        explicitResumeIssues: new Set([args.targetIssue, args.issue].filter(n => n != null && Number.isFinite(n))),
        coTenantSignal: process.env.KAOLA_COTENANT === '1',
        now: Date.now(),
        staleMs: adaptiveSchema.LANE_STALENESS_MS
      };
      const lanes = active.map(f => ({ folder: f, lane: classifyLane(f, ctx) }));
      const mine = lanes.filter(l => l.lane.bucket === 'mine').map(l => l.folder);
      if (mine.length === 1) {
        args.project = mine[0].project;
      } else {
        // Ambiguity is a QUESTION, not a failure: nothing was read past the state files and
        // nothing was written, and the caller answers it by naming one. So it ANSWERS at exit 0,
        // and `resumed: false` / `mutation_performed: false` — not the exit code — are what say
        // the resume did not happen.
        //
        // The candidate SET is the state this stop was freezing, and an answer that lets the
        // agent continue can consume it: a lane ages past the staleness threshold, a marker
        // rotates, a folder gets archived. So the set rides out with enough per candidate to
        // CHOOSE without re-deriving anything — including `classifyLane`'s bucket and reasoning,
        // which are computed here for every folder and were previously kept only for the
        // one-boolean 'mine' test and then dropped. `candidates` keeps its shipped bare-name
        // shape (consumers read it today); the detail is additive beside it.
        output({
          resumed: false,
          result: 'answer',
          reason: 'resume_ambiguous',
          mutation_performed: false,
          candidates: active.map(f => f.project),
          candidate_detail: lanes.map(({ folder, lane }) => ({
            project: folder.project,
            issue_number: folder.issue_number,
            issue_numbers: folder.issue_numbers,
            bundle_id: folder.bundle_id,
            status: folder.status,
            phase: folder.phase,
            branch: folder.branch,
            worktree_path: folder.worktree_path,
            session_marker: folder.session_marker,
            claim_ts: folder.claim_ts,
            lane_bucket: lane.bucket,
            lane_reasoning: lane.reasoning,
            state_file: folder.state_file,
            next_command: reconcileNextCommand(root, folder),
            resume_with: 'resume --project ' + folder.project + ' --json'
          })),
          own_session_marker: ctx.ownSession,
          select_with: 'resume --project <one of candidates> --json'
        });
        return;
      }
    }
  }
  const folder = args.project ? activeByProject(root, args.project) : readActiveFolders(root)[0];
  if (!folder) {
    if (args.project) {
      const archiveCheck = detectFinalizeIncomplete(root, args.project);
      if (archiveCheck !== null) {
        if (archiveCheck.incomplete) {
          output({ resumed: true, project: args.project, reason: 'finalize_incomplete', next_command: 'finalize --keep-worktree' });
          return;
        } else {
          // Not a failure at all: the transaction is SETTLED and there is nothing left to
          // resume. It answers at exit 0 — `resumed: false` and `mutation_performed: false` say
          // the resume did not run, and `settled: true` says why it did not need to.
          // `archive_locus` is the discriminating field the single word hid: the two proofs
          // above are structurally different, and only `main_resident` also implies the branch
          // side is done. `archive_dir` is the directory the verdict was proved against.
          output({
            resumed: false,
            result: 'answer',
            reason: 'already_finalized',
            project: args.project,
            settled: true,
            mutation_performed: false,
            archive_locus: archiveCheck.locus,
            archive_dir: archiveCheck.archive_dir,
            next_action: 'none'
          });
          return;
        }
      }
    }
    output({ resumed: false, reason: '--project or active folder required' }, 1);
    return;
  }
  output({
    resumed: true,
    project: folder.project,
    issue: folder.issue_iid,
    phase: folder.phase,
    next_command: reconcileNextCommand(root, folder)
  });
}

// #333: terminal-stamp the workflow-state CONTENT for an archive. Pure string transform.
// statusValue: 'closed' | 'abandoned' (abandoned keeps mid-run state by design — #324).
// opts.keepOpen: true on a keep-open partial-close archive (finalize --keep-open).
// Idempotent (every transform is a line-anchored replace) — safe to re-apply on crash-resume.
function stampTerminalState(content, statusValue, opts) {
  content = content.replace(/^status:\s*.*$/m, 'status: ' + statusValue);
  if (!/^status:/m.test(content)) content += '\nstatus: ' + statusValue + '\n';
  content = content.replace(/^step:\s*.*$/m, 'step: complete');
  if (!/^step:/m.test(content)) content += '\nstep: complete\n';
  if (statusValue !== 'closed') return content;   // discard/release keeps mid-run state (#324)
  // #324: normalize the pre-run evidence writeState seeded at claim time (last_command: startup /
  // last_result: folder_claimed) so the archived state cannot read as self-contradictory terminal
  // state. The `## Pending Gates` rewrite stood beside these; the block it normalized named the
  // frozen plan, which no longer exists, so the claim no longer seeds it and nothing rewrites it.
  content = content.replace(/^last_command:\s*.*$/m, 'last_command: finalize');
  content = content.replace(/^last_result:\s*.*$/m,
    'last_result: ' + (opts && opts.keepOpen ? 'closed_keep_open' : 'closed'));
  // #333: an archived state must not advertise an active resume command.
  content = content.replace(/^next_command:\s*.*$/m, 'next_command: none (archived)');
  content = content.replace(/^next_skill:\s*.*$/m, 'next_skill: none (archived)');
  // #333: refresh the ## Last Updated line to the archive timestamp.
  content = content.replace(/(^## Last Updated\n)[^\n]*/m, '$1' + new Date().toISOString());
  return content;
}

// #333: append a compact terminal receipt to the ARCHIVED state. Presence-guarded
// (idempotent across crash-resume re-runs). Swallow-on-error.
function appendClosureBlock(destDir, fields) {
  try {
    const p = path.join(destDir, 'workflow-state.md');
    let s = fs.readFileSync(p, 'utf8');
    if (/^## Closure$/m.test(s)) return false;
    s = s.trimEnd() + '\n\n## Closure\n' +
      'archived_at: ' + new Date().toISOString() + '\n' +
      'issue_disposition: ' + fields.issueDisposition + '\n' +
      'claim_label_removed: ' + fields.claimLabelRemoved + '\n' +
      'worktree_removed: ' + fields.worktreeRemoved + '\n' +
      'closure_invariants: ' + fields.closureInvariants + '\n';
    // Atomic: this is the same workflow-state.md whose torn form readActiveFolders silently skips.
    writeFile(p, s);
    return true;
  } catch (_) { return false; }
}

// n5 (#653 finding D3): advisory selection-evidence probe. A file matching selection-evidence.*
// in either cache dir means the planner's no-target survey docked its selection record (see
// workflow-next.md § Selection Evidence Docking) before authoring the plan. Advisory
// only — no invariant, no warning on absence: a user-named (explicit-target) claim legitimately has
// none, since the no-target survey never runs on that branch.
function probeSelectionEvidence(cacheDirCandidates) {
  for (const dir of (cacheDirCandidates || [])) {
    if (!dir) continue;
    try {
      const entries = fs.readdirSync(dir);
      if (entries.some(f => /^selection-evidence\./.test(f))) return 'present';
    } catch (_) { /* dir missing/unreadable — keep probing candidates */ }
  }
  return 'absent';
}

// #395.2: shared roadmap-removal + MAIN-orphan reconcile + regenerate (reused by the cmdFinalize
// source-missing backstop for crash-resume convergence — the #395 fix). #403.7: records the actual
// staged-orphan unstage (roadmap_staged_reconciled).
// #916: also returns roadmap_regenerated_by_root { worktree, main } — the SAME enum, once per root,
// because a linked run rebuilds two mirrors and the scalar can only carry one of them; and
// roadmap_regenerated_main_error, present only when main's rebuild threw.
function reconcileRoadmapForClosure(root, memberNumbers, primaryNumber, opts, mainRoot, linkedRoot) {
  let roadmapSourceRemoved = 'absent';
  let roadmapRegenerated = 'skipped';
  const removedSources = [];
  const stagedReconciled = []; // #403.7: MAIN staged-ADD orphans actually unstaged (#297) — recorded, not silent
  const roadmapByRoot = {}; // #428: dual-root per-member removal map
  const residue = [];       // #428: files that survived despite a removal attempt
  // #705: normalize the per-member keep-open set ONCE (numbers; tolerant of string entries).
  const excludeSet = (opts && Array.isArray(opts.excludeIssues))
    ? new Set(opts.excludeIssues.map(Number)) : null;
  for (const issueN of memberNumbers) {
    const roadmapFilePath = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + issueN + '.md');
    let thisRemoved = 'absent';
    // #336/#705: preserve this member's roadmap source when keep-open is in force for the whole run
    // (keepRoadmapSource) OR when this specific member is in the per-member excludeIssues keep-open
    // set — the issue stays open, so it must stay tracked in the mirror.
    const keepThis = !!(opts && opts.keepRoadmapSource) || (excludeSet !== null && excludeSet.has(Number(issueN)));
    if (keepThis) {
      thisRemoved = 'kept';
    } else {
      try {
        fs.unlinkSync(roadmapFilePath);
        thisRemoved = 'removed';
      } catch (e) {
        thisRemoved = (e.code === 'ENOENT') ? 'absent' : 'failed';
      }
    }
    if (issueN === primaryNumber) roadmapSourceRemoved = thisRemoved;
    if (thisRemoved === 'removed') removedSources.push('issue-' + issueN + '.md');
    // #428: track worktree-root removal state; main-root starts at same value (updated below).
    let thisRemovedWorktree = thisRemoved;
    let thisRemovedMain = (mainRoot && mainRoot !== linkedRoot) ? 'absent' : thisRemovedWorktree;
    // #297/#428: reconcile the MAIN-repo roadmap source for a linked worktree run.
    // #297 handled the staged-ADD orphan (file NOT on HEAD). #428 adds removal of committed files.
    if (mainRoot && mainRoot !== linkedRoot) {
      try {
        const mainRoadmapRel = path.join('kaola-workflow', '.roadmap', 'issue-' + issueN + '.md');
        let onHead = false;
        try {
          execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', 'HEAD:' + mainRoadmapRel],
            { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
          onHead = true;
        } catch (_) { onHead = false; }
        if (!onHead) {
          let wasStaged = false;
          try {
            const staged = execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--name-only', '--', mainRoadmapRel],
              { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            wasStaged = staged.length > 0;
          } catch (_) { wasStaged = false; }
          execFileSync('git', ['-C', mainRoot, 'rm', '--cached', '--force', '--ignore-unmatch', mainRoadmapRel],
            { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
          const mainRoadmapAbs = path.join(mainRoot, mainRoadmapRel);
          try { fs.unlinkSync(mainRoadmapAbs); } catch (e2) { if (e2.code !== 'ENOENT') throw e2; }
          if (wasStaged) stagedReconciled.push('issue-' + issueN + '.md');
          thisRemovedMain = 'absent'; // was only a staged-ADD orphan, no committed copy
        } else if (!keepThis) {
          // #428: file IS committed on main's HEAD — remove the working-tree copy and stage the deletion
          // so the sink commit drops it from main.
          // Exception: when keepWorktree is true, the archive commit on the feature branch will carry
          // the deletion when it is merged to main at sink-merge time; don't stage on main now or it
          // leaves main's index dirty (regression lock for #297 R1).
          const mainRoadmapAbs = path.join(mainRoot, mainRoadmapRel);
          if (!(opts && opts.keepWorktree)) {
            // (1) remove the working-tree file in main
            try { fs.unlinkSync(mainRoadmapAbs); thisRemovedMain = 'removed'; }
            catch (e) { thisRemovedMain = (e.code === 'ENOENT') ? 'absent' : 'failed'; }
            // (2) stage the deletion so the sink commit drops it from main's HEAD
            try {
              execFileSync('git', ['-C', mainRoot, 'rm', '--cached', '--force', '--ignore-unmatch', mainRoadmapRel],
                { stdio: ['ignore', 'ignore', 'ignore'] });
            } catch (_) {}
          } else {
            // keepWorktree: the file still exists on main; its deletion will come via sink-merge.
            thisRemovedMain = 'kept';
          }
        }
      } catch (_) {}
    }
    // #428: build per-member dual-root record
    roadmapByRoot[issueN] = {
      worktree: thisRemovedWorktree === 'removed' || thisRemovedWorktree === 'absent' || thisRemovedWorktree === 'kept',
      main:     thisRemovedMain     === 'removed' || thisRemovedMain     === 'absent' || thisRemovedMain     === 'kept',
    };
    // #428: record residue (surviving files despite a removal attempt, or after a failed unlink)
    if (!keepThis) {
      if (fs.existsSync(roadmapFilePath))
        residue.push({ issue: issueN, root: 'worktree', path: roadmapFilePath, reason: 'unlink_failed' });
      // For keepWorktree, the main-root file intentionally survives (will be removed at sink-merge),
      // so don't flag it as residue.
      if (mainRoot && mainRoot !== linkedRoot && !(opts && opts.keepWorktree)) {
        const mainAbs = path.join(mainRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueN + '.md');
        if (fs.existsSync(mainAbs))
          residue.push({ issue: issueN, root: 'main', path: mainAbs, reason: 'unlink_failed' });
      }
    }
  }
  try {
    roadmapModule.regenerateRoadmap(root);
    roadmapRegenerated = 'regenerated';
  } catch (_) {
    roadmapRegenerated = 'failed';
  }
  // #428: also regenerate the MAIN roadmap when this is a linked worktree run.
  // Skip when keepWorktree is true: the feature-branch merge will carry the deletion + regeneration.
  // #916: the mirror is rebuilt in TWO roots and only the linked one had a field. A main-root
  // failure left `roadmap_regenerated: 'regenerated'` — the LINKED root's honest answer — beside a
  // MAIN mirror still advertising the issue that just closed, and the bare catch ate the only
  // account of why. The scalar keeps its meaning exactly (it is what the merged-folder warning on
  // 'failed' reads); the second root is reported BESIDE it, per-root, in the vocabulary
  // roadmap_removed_by_root already uses, so a reader can tell WHICH mirror is stale.
  const roadmapLinkedRun = !!(mainRoot && mainRoot !== linkedRoot);
  // Not a linked run: `root` IS main, so both keys describe the one rebuild that happened.
  let roadmapRegeneratedMain = roadmapLinkedRun ? 'skipped' : roadmapRegenerated;
  let roadmapRegenerateMainError = null;
  if (roadmapLinkedRun && !(opts && opts.keepRoadmapSource) && !(opts && opts.keepWorktree)) {
    try {
      roadmapModule.regenerateRoadmap(mainRoot);
      roadmapRegeneratedMain = 'regenerated';
    } catch (e) {
      // The message is the evidence: it names which read or write refused, and it is the only thing
      // that tells an operator what to clear before main's mirror can be rebuilt.
      roadmapRegeneratedMain = 'failed';
      roadmapRegenerateMainError = String((e && e.message) || e).trim().slice(0, 300);
    }
  }
  const reconciled = { roadmap_source_removed: roadmapSourceRemoved, roadmap_regenerated: roadmapRegenerated, roadmap_sources_removed: removedSources, roadmap_staged_reconciled: stagedReconciled, roadmap_removed_by_root: roadmapByRoot, roadmap_residue: residue, roadmap_regenerated_by_root: { worktree: roadmapRegenerated, main: roadmapRegeneratedMain } };
  // Attached only when there IS a failure: a key carrying `null` would still read as an error
  // report to anyone (or anything) scanning the receipt for one.
  if (roadmapRegenerateMainError !== null) reconciled.roadmap_regenerated_main_error = roadmapRegenerateMainError;
  return reconciled;
}

// #686: shared barrier-ref tag sanitizer — MUST mirror the projectTag computation adaptive-node.js /
// plan-validator.js use to anchor `refs/kaola-workflow/barrier/<tag>/<node>`
// (`path.basename(<projectDir>).replace(/[^A-Za-z0-9_-]/g, '_')`) so a ref this reaps/sweeps is
// EXACTLY the ref the barrier machinery anchored. Confirmed (grep across the whole tree) that
// `refs/kaola-workflow/` carries exactly two ref namespaces: `barrier/<tag>/<node>` (the barrier
// anchor this file reaps/sweeps) and `leg-base/<project>/<node>` (leg provisioning/teardown — a
// SEPARATE namespace, never touched here). `barrier-base-*` is only a `.cache/` FILE-name prefix
// (the local baseline snapshot), never a ref namespace.
function sanitizeBarrierTag(name) {
  return String(name).replace(/[^A-Za-z0-9_-]/g, '_');
}

function archiveProjectDir(root, project, statusValue, suffix, opts) {
  assert(isSafeName(project), 'unsafe project name');
  const src = projectDir(root, project);
  if (!fs.existsSync(src)) return { skipped: 'source-missing' };
  if (process.env.KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL === '1') {
    return { archived: false, reason: 'archive_forced_refusal' };
  }
  // The #707 pre-flight evidence floor stood here: it asked the `## Node Ledger` which evidence
  // files the run had recorded, and refused when the folder about to be archived no longer held
  // them. There is no ledger to ask any more, and a free-text result is not a file list — the same
  // vanished-declaration this campaign hits everywhere. What survives is the completeness
  // MEASUREMENT in verifyArchiveComplete: every file the source holds must reach the destination
  // before either live copy is deleted.
  const state = stateFile(root, project);
  let archiveIssueNumber = null;
  // #328: read issue_numbers early (before rename) so we have the full member list
  let archiveIssueNumbersRaw = '';
  try {
    let content = fs.readFileSync(state, 'utf8');
    archiveIssueNumber = parseInt(field(content, 'issue_number'), 10);
    archiveIssueNumbersRaw = (field(content, 'issue_numbers') || '').trim();
    // #333: status/step/#324-normalization/next_command/Last Updated all in one helper.
    // (this port has NO removeLegacyStateBlocks — pass raw content directly.)
    content = stampTerminalState(content, statusValue, opts);
    // Atomic (the module's own crash-safe writer): this is the LAST stamp of the terminal state
    // before the folder is renamed into archive/, so a torn write here is unrecoverable — a torn
    // workflow-state.md is silently skipped by readActiveFolders and the project goes invisible.
    writeFile(state, content);
  } catch (_) {}
  // The `## Required Agent Compliance` receipt table used to be rendered into the plan here, at the
  // archive boundary. It was derived — wholly — from `## Nodes` x `## Node Ledger` x `.cache`, and
  // rendering it again would mean carrying that whole plan grammar into the one module every
  // edition shares byte-for-byte, purely to re-materialize a cosmetic table for a record shape that
  // is going away. A plan that already carries a stored section is left byte-for-byte alone, as it
  // always was: nothing reads it for a verdict.
  // #324: sanitize the archived finalization-summary's PRE-SINK sentinels so a later audit reading
  // only the archive cannot mistake a merged/closed run for one still "READY FOR FINAL GIT GATE".
  // BEFORE renameSync so the sanitized copy is what lands in archive/. Swallow-on-error (robust).
  if (statusValue === 'closed') {
    try {
      const summaryPath = path.join(src, 'finalization-summary.md');
      if (fs.existsSync(summaryPath)) {
        let s = fs.readFileSync(summaryPath, 'utf8');
        s = s.replace(/READY FOR FINAL GIT GATE/g, 'ARCHIVED AFTER FINAL GIT GATE');
        s = s.replace(/Pending final git gate\. Final hash reported after push\./g,
          'Final git gate complete; merge/close status recorded in the closure receipt.');
        writeFile(summaryPath, s);
      }
    } catch (_) {}
    // #324 AC3: neutralize the known false-absolute in the archived final-validation evidence so a
    // later audit cannot read "No files changed after those runs" as terminal truth when the finalize
    // node itself later changed docs/CHANGELOG. This is a mechanical BACKSTOP — the accurate reuse
    // boundary is stated by the agent per the finalize.md Validation De-Duplication guidance. (Literal
    // match, like the summary sentinel above; the agent guidance is the primary fix.)
    try {
      const finalValPath = path.join(src, '.cache', 'final-validation.md');
      if (fs.existsSync(finalValPath)) {
        let fv = fs.readFileSync(finalValPath, 'utf8');
        fv = fv.replace(/No files changed after those runs\.?/g,
          'Validation reuse covers code/test impact through the cited node; any later finalize-node docs/CHANGELOG edit is outside that rerun trigger (see the ## Node Ledger).');
        writeFile(finalValPath, fv);
      }
    } catch (_) {}
  }
  // #426: resolve main/linked roots BEFORE any mutation so the archive lands in main first.
  let mainRoot, linkedRoot;
  try {
    mainRoot   = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    linkedRoot = fs.realpathSync(root);
  } catch (_) { mainRoot = null; }
  const isLinkedRun = !!(mainRoot && mainRoot !== linkedRoot);

  let dest;
  if (isLinkedRun) {
    // #832: ONE resolution rule — the archive ALWAYS lands under MAIN's project root, regardless of
    // invocation cwd and regardless of keepWorktree. The former per-call-site derivation sent a
    // `--keep-worktree` archive into the linked worktree (the documented node-cwd locus), and the
    // sink removed that worktree at cleanup — destroying the run's whole evidence trail. There is no
    // valid case for archiving into a tree the sink is about to delete. The archive is untracked on
    // main until the sink's archive_commit step lands it; it never collides with `git checkout`
    // because the feature branch no longer carries the archive path (cmdFinalize cannot stage a path
    // outside its own worktree, so it defers the commit to the sink).
    const archiveBase = path.join(mainRoot, 'kaola-workflow', 'archive');
    fs.mkdirSync(archiveBase, { recursive: true });
    dest = path.join(archiveBase, project + (suffix || ''));
    if (fs.existsSync(dest)) dest += '.archived-' + new Date().toISOString().replace(/[:.]/g, '-');
    copyDir(src, dest);
    // (c) verify archive completeness before any deletion. #676: SOURCE-RELATIVE — every file that
    // exists in the live SOURCE folder must survive byte-for-byte into the copied DEST; a lossy copy
    // that dropped the run record / finalization summary / a per-item .cache evidence file refuses
    // here, before either live copy is deleted (see verifyArchiveComplete).
    const v = verifyArchiveComplete(src, dest);
    // #901: the delete below disposes of TWO live copies and this verifier reads only ONE of them.
    // Both the `mainLive` delete and the src-only comparison PRE-DATE this campaign (baseline
    // 9b68b096 carries the same two statements); what #901 added beside them was a sidecar presence
    // re-check that ALSO read `src`, which is a statement about the one pair that cannot differ —
    // `copyDir` is fully recursive and either reproduces every entry or throws, so a sidecar present
    // in `src` is always present at `dest`. That re-check had no reachable condition, and a guard
    // with no reachable condition reads as coverage; it is gone rather than kept.
    //
    // The pair that CAN differ is `mainLive` ↔ `dest`: main's copy is never copied to `dest` on this
    // path, so nothing established that `dest` subsumed it, and a run whose main copy held evidence
    // the worktree's did not lost those files from EVERYWHERE at exit 0. Three of the four routes
    // here — release / discard, watch-pr on a merged PR, the abandon backstop — run no Step-8a
    // mirror, so "worktree ⊇ main" is not established for them by anything upstream. So the SAME
    // comparison is aimed at that pair, plus the sidecar presence it exempts by design (four of the
    // five files the incident lost are exempt names). One rule: no live copy is deleted while the
    // destination is missing a file THAT copy holds.
    //
    // PRESENCE only, deliberately. Byte-identity is the wrong question for main, whose copy
    // legitimately differs — the terminal stamp, the #324 sentinel rewrite and the final-validation
    // normalization above all rewrite the INVOKING root's copy, never main's — so this reads the
    // comparison's missing[] half and not its mismatched[] half.
    //
    // Two subtractions keep it from refusing over a loss that is not one: the #520 transaction
    // journals (cycle-local scratch that must never be committed anywhere — the same two names
    // ignoredArchiveEvidence and the sink's SINK_STAGE_SKIP already subtract), and files this
    // repository ignores BY NAME (the `.DS_Store` a Finder window leaves in a run folder is not run
    // evidence). A probe fault leaves the by-name set EMPTY, so an unprobeable repo refuses rather
    // than destroys.
    const mainLive = path.join(mainRoot, 'kaola-workflow', project);
    // Disposability decides comparability: a copy that will NOT be deleted needs no statement about
    // it. A realpath resolving to `dest` IS the archive (nothing to lose), and an unresolvable one
    // was never deleted either — both preserved exactly as before.
    let mainLiveDisposable = false;
    if (fs.existsSync(mainLive)) {
      try { mainLiveDisposable = fs.realpathSync(mainLive) !== dest; } catch (_) { mainLiveDisposable = false; }
    }
    // #906: this leg reads uncomparable[] as well as missing[], and that is not a weakening of the
    // "presence only" rule above. Dropping the whole non-missing half also dropped every entry the walk
    // could not reduce to bytes, and those are not files whose bytes legitimately differ — they are
    // entries about which NOTHING was established. Measured before this changed: a main-only symlink at
    // top level, or under any exempt-sidecar name, was archived-and-deleted at exit 0 and was then in no
    // copy anywhere, because a symlink never enters the byte map and reaches missing[] only if
    // listSourceEvidenceFiles happens to name it. `fs.rmSync` does not follow the link, so what is lost
    // is the link and never the target's bytes — a smaller loss than a dropped file, and still a loss
    // nobody agreed to. Fail-closed by construction: it can only ADD a refusal, and it cannot
    // false-refuse an ordinary run, because copyDir follows links and archives hold none of their own.
    let missingFromMain = [];
    let uncomparableFromMain = [];
    if (mainLiveDisposable) {
      const mainCompare = verifyArchiveComplete(mainLive, dest);
      missingFromMain = (mainCompare.missing || [])
        .concat(missingArchiveSidecars(mainLive, dest))
        .filter(rel => !SINK_JOURNAL_RE.test(rel));
      const ignoredByName = repoWideIgnoredNames(mainRoot, missingFromMain);
      missingFromMain = missingFromMain.filter(rel => !ignoredByName.has(rel.split('/').pop()));
      // Same two subtractions, for the same two reasons: a journal is never evidence, and a name this
      // repository ignores is not run evidence either. A probe fault leaves the by-name set EMPTY, so
      // an unprobeable repo refuses rather than destroys — as above.
      uncomparableFromMain = (mainCompare.uncomparable || []).filter(rel => !SINK_JOURNAL_RE.test(rel));
      const ignoredUncomparable = repoWideIgnoredNames(mainRoot, uncomparableFromMain);
      uncomparableFromMain = uncomparableFromMain.filter(rel => !ignoredUncomparable.has(rel.split('/').pop()));
    }
    // Carry BOTH incompleteness signals. verifyArchiveComplete can fail with an EMPTY missing[]
    // and a non-empty mismatched[] — a file that reached the destination with different bytes — and
    // dropping that half left the sink unable to tell a corrupt archive from a clean one.
    if (!v.ok || missingFromMain.length > 0 || uncomparableFromMain.length > 0) {
      // De-duplicated: the two live copies overlap by design, and a file BOTH hold that the
      // destination lacks is one loss, not two.
      const missing = Array.from(new Set((v.missing || []).concat(missingFromMain)));
      // Main's uncomparable entries are reported in the half that already carries entry-kind faults,
      // so both consumers of this result (cmdFinalize's refusal and the sink's) name them with no
      // change of their own. De-duplicated against the source side for the same reason as missing[].
      const mismatched = Array.from(new Set((v.mismatched || []).concat(uncomparableFromMain)));
      return { skipped: undefined, archived: false, archive_incomplete: true,
        missing, mismatched, dest };
    }
    // (d) delete BOTH live copies — only after copy+verify confirmed, for EACH of them.
    fs.rmSync(src, { recursive: true, force: true });          // worktree live folder
    if (mainLiveDisposable) fs.rmSync(mainLive, { recursive: true, force: true }); // main live folder
  } else {
    // in-place run: existing renameSync path unchanged. #676: no completeness gate needed here —
    // an atomic rename relocates the WHOLE live folder, so the archive dest is byte-identical to
    // the former source and no evidence file can be dropped (the source-relative loss the gate
    // catches only happens on the copy+verify linked-run path above).
    const archiveBase = path.join(root, 'kaola-workflow', 'archive');
    fs.mkdirSync(archiveBase, { recursive: true });
    dest = path.join(archiveBase, project + (suffix || ''));
    if (fs.existsSync(dest)) dest += '.archived-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(src, dest);
  }
  // #686: archive-time reap of dangling refs/kaola-workflow/barrier/<tag>/* refs for THIS project.
  // archiveProjectDir is the convergence point for finalize-closed, discard-abandoned, and the
  // active-folders backstop, so this ONE insertion covers every archive path. Placed AFTER the live
  // copy is gone — both the isLinkedRun copy+verify+delete branch and the in-place renameSync branch
  // above have already completed — so a still-open barrier check against the live folder can never
  // race a reaped ref. FAIL-SOFT is correctness-critical: the evidence files are already archived by
  // this point, so a ref-delete (or even the enumeration) failing must NEVER throw, block, or roll
  // back finalize — swallow everything. Runs against the resolved MAIN root (mainRoot, already
  // computed above for the archive-destination logic; barrier refs are shared common refs so either
  // root works, but mainRoot is preferred since it is always resolved for a linked run).
  try {
    const barrierTag = sanitizeBarrierTag(project);
    const reapRoot = mainRoot || root;
    const prefix = 'refs/kaola-workflow/barrier/' + barrierTag + '/';
    const listed = execFileSync('git', ['for-each-ref', '--format=%(refname)', prefix],
      { cwd: reapRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    // NEWLINE-SPLIT ON PURPOSE — this stream carries REF NAMES, never pathnames, and the two facts
    // that make the split lossless were measured, not assumed: `--format=%(refname)` emits the name
    // verbatim (no C-quoting even for `"` or non-ASCII), and git REFUSES to create a ref whose name
    // contains LF, TAB, space or backslash (`check-ref-format` rejects them). So no record can span
    // a line and the `.trim()` is a provable no-op. A `-z` conversion here would buy nothing.
    for (const refName of listed.split('\n').map(s => s.trim()).filter(Boolean)) {
      try {
        execFileSync('git', ['update-ref', '-d', refName], { cwd: reapRoot, stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (_) { /* fail-soft: a single ref-delete failure must not abort the reap or the archive */ }
    }
  } catch (_) { /* fail-soft: archiving must never be blocked/rolled back by a ref-reap failure */ }
  let roadmapSourceRemoved = 'absent';
  let roadmapRegenerated = 'skipped';
  // #328: accumulate removed sources for bundle path (plural array)
  const removedSources = [];
  let stagedReconciled = []; // #403.7: MAIN staged-ADD orphans actually unstaged (#297)
  if (statusValue === 'closed') {
    // #328: for a bundle project, use the pre-read member array (archiveIssueNumbersRaw was
    // captured BEFORE the renameSync so we can parse it now even though the file moved)
    let archiveIssueNumbers = [];
    if (archiveIssueNumbersRaw) {
      archiveIssueNumbers = archiveIssueNumbersRaw.split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isFinite(n) && n > 0);
    }
    if (archiveIssueNumbers.length === 0 && Number.isInteger(archiveIssueNumber) && archiveIssueNumber > 0) {
      archiveIssueNumbers = [archiveIssueNumber];
    }
    // #395.2: shared helper (reused by the cmdFinalize source-missing backstop for crash-resume convergence).
    const reconciled = reconcileRoadmapForClosure(root, archiveIssueNumbers, archiveIssueNumber, opts, mainRoot, linkedRoot);
    roadmapSourceRemoved = reconciled.roadmap_source_removed;
    roadmapRegenerated = reconciled.roadmap_regenerated;
    for (const s of reconciled.roadmap_sources_removed) removedSources.push(s);
    stagedReconciled = reconciled.roadmap_staged_reconciled || [];
    // #428: surface dual-root removal map + residue so cmdFinalize can attach them to the receipt.
    const closedResult = {
      archived: true,
      dest,
      roadmap_source_removed: roadmapSourceRemoved,
      roadmap_regenerated: roadmapRegenerated,
      roadmap_sources_removed: removedSources,
      roadmap_staged_reconciled: stagedReconciled,
      roadmap_removed_by_root: reconciled.roadmap_removed_by_root || {},
      roadmap_residue: reconciled.roadmap_residue || [],
      // #916: the per-root REBUILD outcome, beside the per-root removal map above.
      roadmap_regenerated_by_root: reconciled.roadmap_regenerated_by_root || {},
    };
    if (reconciled.roadmap_regenerated_main_error) {
      closedResult.roadmap_regenerated_main_error = reconciled.roadmap_regenerated_main_error;
    }
    return closedResult;
  }
  return {
    archived: true,
    dest,
    roadmap_source_removed: roadmapSourceRemoved,
    roadmap_regenerated: roadmapRegenerated,
    roadmap_sources_removed: removedSources,
    roadmap_staged_reconciled: stagedReconciled,
  };
}

// #832: classify the fate of an archive destination the CALLING root cannot commit, so a receipt
// never claims success for an operation git refused. Returns 'skipped_gitignored' when the
// consumer's .gitignore covers the archive band (`git add` is a refusal, not a commit — the exact
// silent-false-claim the incident produced), 'deferred_to_sink' when the archive is main-resident
// and awaiting the sink's own archive_commit step, or null when the caller's ordinary
// staged/committed accounting applies. Existence of the dest is not re-probed: the caller only
// reaches here with the dest archiveProjectDir just wrote.
//
// #901: the probe is on the archive DIRECTORY, and that granularity is deliberate HERE — it is the
// same question the sink's archive_commit step asks to decide whether to honor a whole-band ignore,
// and the two surfaces must not disagree. What it cannot see is a rule that clips a SUBTREE out of an
// archive the consumer does want (a basename `.cache/` leaves the directory un-ignored while covering
// every evidence file beneath it): that is still a genuine `deferred_to_sink`, because the sink now
// force-adds exactly those paths and verifies each became a blob. The blindness was the SILENCE, not
// the token — see ignoredArchiveEvidence, which the caller reports alongside the deferral.
function classifyArchiveDisposition(mainRoot, dest) {
  const relPosix = archiveRelFromRoot(mainRoot, dest);
  if (!relPosix) return null;
  try {
    // exit 0 = the path IS ignored; exit 1 = not ignored; anything else = probe fault. Only a
    // proven refusal earns the skipped_gitignored token — a probe fault must not manufacture one.
    execFileSync('git', ['-C', mainRoot, 'check-ignore', '-q', '--', relPosix],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    return 'skipped_gitignored';
  } catch (_) { /* not ignored (or unprobeable) — the sink commits it from main */ }
  return 'deferred_to_sink';
}

// #901: the repo-relative POSIX path of an archive dest that lies inside `mainRoot`, or null when it
// does not (a linked-run dest resolved against a different root, or an unrelativizable pair). Shared
// so the disposition classifier and the ignored-evidence probe below ask about the SAME path.
function archiveRelFromRoot(mainRoot, dest) {
  if (!mainRoot || !dest) return null;
  let rel;
  try { rel = path.relative(mainRoot, dest); } catch (_) { return null; }
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
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
// Kept identical to kaola-workflow-sink-merge.js's copy; a divergence between the two is a bug.
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

// #901: the run-evidence files under an archive dest that this repository's .gitignore covers —
// untracked AND ignored, so `git add <dest>/` skips them while still staging their non-ignored
// siblings and exiting 1. `-o -i --exclude-standard` answers per FILE, which is the granularity the
// directory probe above cannot reach, and it is index-aware so an already-tracked path is correctly
// absent. The #520 journals are subtracted: they are cycle-local scratch that must never be
// committed anyway, so naming them would report a loss that is not one. So are the by-name-ignored
// paths, because this list PROMISES that the sink force-adds every entry — and the sink no longer
// force-adds those. The two sets must agree or the NOTE describes an override that will not happen.
// Any probe fault yields the empty set — an unprobeable repo must not manufacture a warning.
function ignoredArchiveEvidence(mainRoot, dest) {
  const relPosix = archiveRelFromRoot(mainRoot, dest);
  if (!relPosix) return [];
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'ls-files', '-o', '-i', '--exclude-standard', '-z', '--', relPosix + '/'],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    // Split on NUL and NOTHING ELSE. `-z` is chosen so a pathname is never quoted or mangled, and a
    // `.trim()` here undid exactly that: `notes.md ` (one trailing space) came back as `notes.md`,
    // matched nothing the disk walk produced, and the whole point of the -z stream was lost. Measured:
    // the stream is purely NUL-TERMINATED with no trailing newline, so dropping empty records is the
    // only normalization it needs. Kept byte-identical to the sink's two -z readers.
    const covered = out.split('\0').filter(Boolean)
      .filter(p => !SINK_JOURNAL_RE.test(p));
    const ignoredByName = repoWideIgnoredNames(mainRoot, covered);
    return covered.filter(p => !ignoredByName.has(p.split('/').pop()));
  } catch (_) { return []; }
}

// #901: ONE wording for the disposal refusal's remedy, because the path list alone cannot carry it.
// EVERY live copy is compared against the archive, so a named file may be held by either tree — and
// the two are not interchangeable for the fix: the archive is built by copying the INVOKED tree's
// folder, so a file left only in the main checkout is not carried in by a re-run. Naming the tree is
// the whole remedy; without it "re-run finalize" is advice the operator cannot act on, which is the
// same unactionable-hint defect this campaign removed from two other refusals. Rendered by every
// surface that carries prose, so the sentence exists once.
function archiveIncompleteRemedy(root, project) {
  const live = projectDir(root, project);
  return 'Every live copy is compared against the archive — the run folder in the tree this command '
    + 'was invoked from (' + live + ') and, on a linked run, the one in the main checkout — so a named '
    + 'file may be held by either. Put each named file in ' + live + ', then re-run: the archive is '
    + 'built by copying THAT folder, so a file left only in the main checkout is not carried in.';
}

function archiveProjectDirSafely(root, project, statusValue, suffix, opts) {
  try {
    return archiveProjectDir(root, project, statusValue, suffix, opts);
  } catch (error) {
    return { archived: false, reason: 'archive_exception', detail: error && error.message ? error.message : String(error) };
  }
}

// #715: commit a `.discarded-` archive produced by release / watch-pr. The archive lands at the
// main root as UNTRACKED residue; the next sink's preflight would refuse it as foreign dirt, so
// the operator had to hand-commit it before any sink could proceed. Mirrors the sink's
// archive_commit step (kaola-gitea-workflow-sink-merge.js): stage the ACTUAL result.dest (never a
// reconstructed plain path — a collision suffix escapes one, the #700 lesson), skip the commit
// when nothing staged (diff-quiet guard), then verify the archive landed at HEAD. #749 R2: the
// archive is a MOVE, so when the repo tracks the live `kaola-workflow/<project>` source that path
// joins both pathspecs (conditional on a tracked-probe — an empty pathspec is fatal to `git add`)
// and `committed:true` additionally requires the source GONE at HEAD. Local git only:
// KAOLA_WORKFLOW_OFFLINE must NOT skip it. A failed commit must NEVER strand the release (the live
// folder is already gone) or throw past the emit — the outcome is returned as
// { committed: true, branch } or { committed: false, branch, detail } for the caller to record
// loudly on the emitted JSON.
// #715 F1: the commit may ONLY bind to the branch that SURVIVES the release (the base branch) —
// never onto a branch the release itself deletes/discards, never onto an arbitrary current
// branch. The base-branch guard therefore lives INSIDE this helper (both call sites inherit it):
// the current branch is resolved from the dest's own toplevel and compared against baseBranch
// BEFORE staging. Off-base (or unresolvable base) → skip: the archive stays on disk as
// recoverable residue and the refusal is returned truthfully with the current branch disclosed.
// `branch` is disclosed on EVERY outcome (success and skip) so the emitted JSON can always name
// the receiving (or non-receiving) branch.
// #715 N5-A: string equality is not enough — baseBranch comes from operator-controlled durable
// state (the tooling never writes these values, so a hand-edit or external corruption is the
// precondition). Before staging, the guard additionally (a) rejects the detached-HEAD sentinel
// 'HEAD' as a base outright, (b) verifies base names a REAL local branch ref (argument-array
// `rev-parse --verify`, never shell interpolation), (c) refuses a base naming the branch the
// call site is discarding (opts.discardedBranch — release: the feature branch; sweep: the
// folder's own lane), and (d) when the call site cannot otherwise prove the base survives
// (opts.defaultBase — the sweep has no restore step, so only the repo's default branch is
// provably surviving-and-integration there) refuses a base naming any other branch, including
// the current arbitrary lane. Every refusal happens BEFORE staging: no commit anywhere, the
// branch disclosed, the archive left as recoverable residue.
// #715 N5-B: the guard is check-then-act — a concurrent process can re-point HEAD between
// staging and the commit. After the commit the checkout is RE-RESOLVED and must still equal the
// guarded base, and the HEAD commit must be reachable from base (`merge-base --is-ancestor`,
// argument-array). Any mismatch DOWNGRADES to { committed: false } with the ACTUAL receiving
// branch disclosed — never the stale pre-race base — leaving the off-base commit recoverable.
function commitDiscardArchive(result, project, baseBranch, opts) {
  if (!result || !result.dest || !fs.existsSync(result.dest)) {
    return { committed: false, branch: null, detail: 'no archive dest to commit' };
  }
  opts = opts || {};
  const discardedBranch = String(opts.discardedBranch || '').trim();
  const defaultBase = String(opts.defaultBase || '').trim();
  let currentBranch = null;
  try {
    const top = execFileSync('git', ['-C', result.dest, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const rel = path.relative(top, result.dest).split(path.sep).join('/');
    if (!rel || rel.startsWith('..')) {
      return { committed: false, branch: null, detail: 'archive dest is outside its git toplevel: ' + result.dest };
    }
    currentBranch = execFileSync('git', ['-C', top, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const base = String(baseBranch || '').trim();
    if (!base) {
      return { committed: false, branch: currentBranch,
        detail: 'no resolvable base branch; refusing to commit the discard archive onto current branch "' +
          currentBranch + '" — the archive stays uncommitted as recoverable residue' };
    }
    // #715 N5-A (a): the 'HEAD' sentinel is what `rev-parse --abbrev-ref HEAD` returns when NO
    // branch is checked out — it is by definition not a branch. Reject it as a base outright.
    if (base === 'HEAD') {
      return { committed: false, branch: currentBranch,
        detail: 'recorded base branch "HEAD" is the detached-HEAD sentinel, not a real branch; ' +
          'refusing to commit the discard archive — the archive stays uncommitted as recoverable residue' };
    }
    // #715 N5-A (b): base must name a REAL local branch ref (argument-array verify; the
    // refs/heads/ prefix confines the lookup to the branches namespace).
    let baseRefExists = false;
    try {
      execFileSync('git', ['-C', top, 'rev-parse', '--verify', 'refs/heads/' + base],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      baseRefExists = true;
    } catch (_) { /* unresolvable → not a real local branch */ }
    if (!baseRefExists) {
      return { committed: false, branch: currentBranch,
        detail: 'recorded base branch "' + base + '" does not name a real local branch; refusing to commit ' +
          'the discard archive onto current branch "' + currentBranch + '" — the archive stays uncommitted as recoverable residue' };
    }
    // #715 N5-A (c): base may not name the branch this call is discarding (release: the feature
    // branch; sweep: the folder's own lane) — a commit there is orphaned by the natural cleanup.
    if (discardedBranch && base === discardedBranch) {
      return { committed: false, branch: currentBranch,
        detail: 'recorded base branch "' + base + '" names the branch being discarded; refusing to commit ' +
          'the discard archive onto the discarded branch — the archive stays uncommitted as recoverable residue' };
    }
    // #715 N5-A (d): at a call site with no restore step (the sweep), only the repo's default
    // branch is provably surviving-and-integration — a base naming any other branch (including
    // the current arbitrary lane) is refused, however the durable base_branch was falsified.
    if (defaultBase && base !== defaultBase) {
      return { committed: false, branch: currentBranch,
        detail: 'recorded base branch "' + base + '" is not the surviving default branch "' + defaultBase +
          '"; refusing to commit the discard archive onto current branch "' + currentBranch +
          '" — the archive stays uncommitted as recoverable residue' };
    }
    if (currentBranch !== base) {
      return { committed: false, branch: currentBranch,
        detail: 'current branch "' + currentBranch + '" is not the surviving base branch "' + base +
          '"; the discard archive stays uncommitted as recoverable residue' };
    }
    // #749 R2: the archive MOVE is two halves — an ADD at the destination and a DELETE of the live
    // `kaola-workflow/<project>` source. Staging only the destination left the source deletions
    // unstaged whenever the consumer repo TRACKS the active folder, so `committed:true` named a
    // half-recorded move and the discarded run stayed readable at HEAD. Derive the source from the
    // ACTUAL dest (never a reconstructed plain path — the #700 lesson): dest is
    // <…>/kaola-workflow/archive/<name>, so its grandparent joined with `project` is the live
    // folder. The tracked-probe is MANDATORY, not an optimization: `git add -A -- <no-match>` is
    // fatal (exit 128), so an unconditional source pathspec would flip the common
    // untracked-active-folder case into a false committed:false.
    let srcRel = null;
    try {
      const srcAbs = path.join(path.dirname(path.dirname(result.dest)), project);
      const candidate = path.relative(top, srcAbs).split(path.sep).join('/');
      if (candidate && !candidate.startsWith('..') && candidate !== rel) {
        const tracked = execFileSync('git', ['-C', top, 'ls-files', '--', candidate],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (tracked) srcRel = candidate;
      }
    } catch (_) { /* unprobeable → treat as untracked; the truth check below stays destination-only */ }
    const pathspecs = srcRel ? [rel, srcRel] : [rel];
    try {
      execFileSync('git', ['-C', top, 'add', '-A', '--'].concat(pathspecs), { encoding: 'utf8' });
    } catch (e) {
      return { committed: false, branch: currentBranch, detail: 'git add failed for ' + pathspecs.join(', ') + ': ' + (e && e.message ? e.message : String(e)) };
    }
    // diff-quiet guard: skip the commit when nothing was staged.
    let hasStaged = false;
    try { execFileSync('git', ['-C', top, 'diff', '--cached', '--quiet', '--'].concat(pathspecs), { stdio: 'ignore' }); }
    catch (e) { if (e && e.status === 1) hasStaged = true; /* other status = diff error → do not commit */ }
    if (hasStaged) {
      execFileSync('git', ['-C', top, 'commit', '-m', 'chore: discard archive ' + project, '--'].concat(pathspecs), { encoding: 'utf8' });
    }
    // #715 N5-B: TOCTOU — re-resolve the checkout AFTER the commit and require it to still be
    // the guarded base, then require the HEAD commit to be reachable from base. A concurrent
    // re-point downgrades to a truthful committed:false with the ACTUAL receiving branch
    // disclosed (never the stale pre-race base); the off-base commit stays recoverable there.
    let branchAfter = currentBranch;
    try {
      branchAfter = execFileSync('git', ['-C', top, 'rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (_) { /* unresolvable → the reachability check below fails closed */ }
    if (branchAfter !== base) {
      return { committed: false, branch: branchAfter,
        detail: 'HEAD moved from "' + base + '" to "' + branchAfter + '" during the discard archive commit; ' +
          'the commit landed off-base on "' + branchAfter + '" (recoverable there) — not reporting it committed on the surviving base' };
    }
    let reachableFromBase = false;
    try { execFileSync('git', ['-C', top, 'merge-base', '--is-ancestor', 'HEAD', base], { stdio: 'ignore' }); reachableFromBase = true; }
    catch (_) { /* not an ancestor (or probe failure) → cannot prove reachability → fail closed */ }
    if (!reachableFromBase) {
      return { committed: false, branch: branchAfter,
        detail: 'the discard archive commit at HEAD is not reachable from the surviving base branch "' + base +
          '" — not reporting it committed; the archive stays recoverable' };
    }
    const atHead = execFileSync('git', ['-C', top, 'cat-file', '-t', 'HEAD:' + rel],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (atHead !== 'tree') {
      return { committed: false, branch: currentBranch, detail: 'archive ' + rel + ' is not present at HEAD after the commit attempt' };
    }
    // #749 R2: the destination landing is only HALF the move. When the source was tracked, require
    // it GONE at HEAD too — otherwise `committed:true` would claim a move the commit only half
    // recorded, leaving the discarded run readable at HEAD and its deletions as unstaged residue
    // the next sink preflight refuses as foreign dirt.
    if (srcRel) {
      const srcAtHead = execFileSync('git', ['-C', top, 'ls-tree', '-r', '--name-only', 'HEAD', '--', srcRel],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (srcAtHead) {
        return { committed: false, branch: currentBranch, detail: 'the discard archive commit recorded ' + rel +
          ' but the live source ' + srcRel + ' is still present at HEAD — the move is only half committed; ' +
          'the unstaged source deletions stay as recoverable residue' };
      }
    }
    return { committed: true, branch: currentBranch };
  } catch (e) {
    return { committed: false, branch: currentBranch, detail: 'discard archive commit failed: ' + (e && e.message ? e.message : String(e)) };
  }
}

// #617: opts.implRef/opts.sinkTarget let a merge-lane caller (sink-merge — the seam that
// performs the real merge + close) wire the remote-closed-after-publish invariant declared in
// kaola-workflow-closure-contract.js but never evaluated anywhere. When supplied, verifies the
// recorded implementation commit is `git merge-base --is-ancestor` of the sink target and
// records the verdict on the receipt (receipt.remote_closed_after_publish); a caller that omits
// opts leaves this check a pure no-op (byte-identical to today — cmdFinalize's merge-lane defers
// its own close, so it never has a genuine close to verify at this seam).
function checkClosureInvariants(root, receipt, archiveDest, opts) {
  const violations = [];
  const issueNumber = receipt.issue_number;
  const abandoned = receipt && receipt.archive === 'abandoned';
  // #328: for a bundle project, loop roadmap-source-absent + roadmap-mirror-clean checks
  // over ALL members; fall back to scalar issue_number for single-issue (AC#1 unchanged).
  const memberNumbers = Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length
    ? receipt.issue_numbers
    : (Number.isInteger(issueNumber) && issueNumber > 0 ? [issueNumber] : []);
  // #336: keep-open inverts the roadmap checks — the source MUST survive and the mirror MUST
  // still list #N (the issue stays open).
  // #396.3: key on the RECORDED INTENT (keep_open_requested), not the mutable remote_issue_closed
  // token (which flips to 'already_closed' on a forge auto-close). Fall back to the legacy token.
  const keepOpen = (receipt.keep_open_requested === true) ||
    (receipt.keep_open_requested === undefined && receipt.remote_issue_closed === 'kept_open');
  if (!abandoned && memberNumbers.length > 0) {
    const invSourceAbsent = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'roadmap-source-absent');
    const invMirrorClean = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'roadmap-mirror-clean');
    const invKeep = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'keep-open-roadmap-preserved');
    for (const n of memberNumbers) {
      const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md');
      const roadmapMirror = path.join(root, 'kaola-workflow', 'ROADMAP.md');
      // #339: an active row in the generated mirror is exactly `| #N | …` at
      // line start (kaola-workflow-roadmap.js buildTableRow). A bare substring
      // match also hits legitimate cross-references to #N inside OTHER rows
      // (e.g. "place_inside (#562 opacity)" in a dependency note), so anchor
      // on the row's issue column instead.
      const sourceExists = fs.existsSync(roadmapFile);
      let mirrorListsN = false;
      try {
        const content = fs.readFileSync(roadmapMirror, 'utf8');
        mirrorListsN = new RegExp('^\\| #' + n + ' \\|', 'm').test(content);
      } catch (_) {}
      if (keepOpen) {
        // Inverted preservation check: violation when the source is MISSING or the mirror
        // no longer lists #N. One invariant id, member-suffixed like the bundle pattern.
        if (!sourceExists || !mirrorListsN) {
          const baseDescK = invKeep ? invKeep.description : 'keep-open roadmap source/mirror not preserved';
          violations.push({
            id: 'keep-open-roadmap-preserved',
            description: memberNumbers.length > 1 ? (baseDescK + ' (issue #' + n + ')') : baseDescK
          });
        }
        continue;
      }
      if (sourceExists) {
        const baseDesc = invSourceAbsent ? invSourceAbsent.description : 'roadmap source file still present';
        violations.push({
          id: 'roadmap-source-absent',
          description: memberNumbers.length > 1 ? (baseDesc + ' (issue #' + n + ')') : baseDesc
        });
      }
      if (mirrorListsN) {
        const baseDesc2 = invMirrorClean ? invMirrorClean.description : 'ROADMAP.md still lists issue as active';
        violations.push({
          id: 'roadmap-mirror-clean',
          description: memberNumbers.length > 1 ? (baseDesc2 + ' (issue #' + n + ')') : baseDesc2
        });
      }
    }
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
      const stateFilePath = path.join(archiveDest, 'workflow-state.md');
      if (fs.existsSync(stateFilePath)) {
        const stateContent = fs.readFileSync(stateFilePath, 'utf8');
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
  // #369 remote-members-closed: for a bundle, a member left in failed_issue_closures or open_issues
  // (recorded while online) flags this WARN-FIRST-but-VISIBLE invariant so a partial close is never
  // a clean success. Single-issue receipts carry neither array, so this never fires for them (AC7).
  const unclosedMembers = []
    .concat(Array.isArray(receipt.failed_issue_closures) ? receipt.failed_issue_closures : [])
    .concat(Array.isArray(receipt.open_issues) ? receipt.open_issues : []);
  // #396.4 (D2): cmdFinalize runs BEFORE the merge sink closes members → close_disposition:'close_pending'
  // suppresses this premature alarm (the members WILL close at sink). The sink + watch leave it unset.
  const closePending = receipt.close_disposition === 'close_pending';
  if (!abandoned && !closePending && unclosedMembers.length > 0) {
    const invMc = closureContract.CLOSURE_INVARIANTS.find(function(i) { return i.id === 'remote-members-closed'; });
    violations.push({
      id: 'remote-members-closed',
      description: (invMc ? invMc.description : 'bundle member(s) not closed') + ' (unclosed: ' + unclosedMembers.sort(function(a, b){ return a - b; }).join(',') + ')'
    });
  }
  // #617: remote-closed-after-publish — a real incident closed an issue whose implementation
  // commit never actually became an ancestor of the sink target (the merge sink died before it
  // ran). Only evaluated when the caller supplies verification refs; see the function header.
  if (opts && opts.implRef && opts.sinkTarget) {
    let published = false;
    try {
      execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', opts.implRef, opts.sinkTarget], { stdio: 'ignore' });
      published = true;
    } catch (_) { published = false; }
    receipt.remote_closed_after_publish = published ? 'verified' : 'failed';
    if (!published) {
      const invPub = closureContract.CLOSURE_INVARIANTS.find(function(i) { return i.id === 'remote-closed-after-publish'; });
      violations.push({
        id: 'remote-closed-after-publish',
        description: (invPub ? invPub.description : 'the remote issue was closed before the implementation was verified merged') +
          ' (commit ' + opts.implRef + ' is not an ancestor of ' + opts.sinkTarget + ')'
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

// #416: pure helpers — extracted so they are directly unit-testable.
//
// isProbeDegraded: true when the forge probe threw and set remoteIssueClosed='skipped_offline'
// even though OFFLINE is false.  A probe outage while ONLINE is "unknown", not "pending"; the
// caller should surface probe_degraded rather than treating the close as pending.
function isProbeDegraded(offline, remoteIssueClosed) {
  return !offline && remoteIssueClosed === 'skipped_offline';
}
//
// computeClosePendingFinalize: Returns true only when the close is genuinely PENDING (online,
// not keep-open, probe returned a non-error token).  The old inline expression treated a probe
// failure ('skipped_offline' while ONLINE) as close_pending because 'skipped_offline' is neither
// 'already_closed' nor 'closed' — silently downgrading the remote-members-closed invariant.
// Exclude 'skipped_offline' here so a probe outage is treated as unknown rather than pending.
function computeClosePendingFinalize(keepIssueOpen, offline, remoteIssueClosed) {
  return !keepIssueOpen && !offline &&
    remoteIssueClosed !== 'already_closed' &&
    remoteIssueClosed !== 'closed' &&
    remoteIssueClosed !== 'skipped_offline';
}

function buildClosureReceipt(project, issueNumber, steps) {
  const receipt = closureContract.emptyReceipt(project, issueNumber);
  const fields = closureContract.CLOSURE_RECEIPT_FIELDS;
  if (steps && typeof steps === 'object') {
    for (const key of Object.keys(steps)) {
      if (key === 'warnings') continue;
      // #395.1: skip undefined so emptyReceipt()'s seeded 'failed' default survives (fields never vanish).
      if (Object.prototype.hasOwnProperty.call(fields, key) && steps[key] !== undefined) {
        receipt[key] = steps[key];
      }
    }
    if (Array.isArray(steps.warnings)) {
      for (const w of steps.warnings) receipt.warnings.push(w);
    }
  }
  return receipt;
}

// What this measures is DECLARATION, never satisfaction.
//
// It replaces the retired `goal_check`, whose enum ('satisfied' | 'unsatisfied' | 'absent')
// rendered a presence check as a verdict. Two things were wrong with that, and the second is worse
// than the first: the negative case was unreachable (its own comment said 'unsatisfied' was
// "reserved for future use"), AND the positive case named a check that does not exist anywhere in
// this workflow — the closure schema documented 'satisfied' as "AC verified" while nothing
// verifies acceptance criteria. Driven end-to-end, the old field wrote `goal_check: satisfied`
// into the terminal closure receipt for `KAOLA_GOAL="cure cancer"` on a run that achieved nothing.
// The verdict is deleted; the measurement under it is kept and named for what it actually is.
//
// Advisory only — never throws, never blocks finalize.
// planDirs: ordered array of run folders to search (archive dest first, then live).
//   Returns { declared, source, probed }:
//   declared — a goal TEXT was found. Not a claim that anything was achieved.
//   source   — 'env' (KAOLA_GOAL, non-empty after trim) | 'plan' (the mission list's H1) | null.
//   probed   — every file examined, in order, so a reader can see exactly what was inspected
//              and re-run the same check by hand. Empty when KAOLA_GOAL answered first and no file
//              was opened — which is itself the honest record of what happened.
// The goal is read from the run record's H1. A folder carrying no mission list declares nothing,
// which is the honest answer rather than a second reader kept alive for a record shape that is
// going away.
function computeGoalDeclaration(planDirs) {
  const probed = [];
  const envGoal = (process.env.KAOLA_GOAL || '').trim();
  if (envGoal) return { declared: true, source: 'env', probed };
  for (const dir of (planDirs || [])) {
    if (!dir) continue;
    const recordPath = path.join(dir, adaptiveSchema.MISSION_LIST_FILE);
    probed.push(recordPath);
    try {
      if (!fs.existsSync(recordPath)) continue;
      const { goal } = parseGoal(fs.readFileSync(recordPath, 'utf8'));
      if (goal) return { declared: true, source: 'plan', probed };
    } catch (_) {}
  }
  return { declared: false, source: null, probed };
}

// Source-missing Finalization must bind to one archive transaction authority, never merely to the
// historical exact path. archiveProjectDir suffixes a new destination when archive/<project>
// already exists, so exact + suffixed matches are ambiguous without a surviving live claim anchor.
function findArchiveAuthorities(root, project) {
  const candidateRoots = [root];
  try {
    const main = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    if (!candidateRoots.some(candidate => path.resolve(candidate) === path.resolve(main))) candidateRoots.push(main);
  } catch (_) {}
  const authorities = [];
  const seen = new Set();
  for (const candidateRoot of candidateRoots) {
    const archiveBase = path.join(candidateRoot, 'kaola-workflow', 'archive');
    let names = [];
    try { names = fs.readdirSync(archiveBase); }
    catch (_) { if (fs.existsSync(path.join(archiveBase, project))) names = [project]; }
    for (const name of names) {
      if (name !== project && !name.startsWith(project + '.archived-')) continue;
      const authority = path.resolve(archiveBase, name);
      if (seen.has(authority) || !fs.existsSync(authority)) continue;
      seen.add(authority);
      authorities.push(authority);
    }
  }
  return authorities;
}

// ─── #816: the mechanical finalization transaction ────────────────────────────────────────────
// cmdFinalize owns the whole mechanical residue end-to-end — artifact mirror, archive + status
// close, roadmap staging, and the `chore: finalize` commit gate — as ONE typed, crash-resumable
// transaction. The orchestrator issues one command and reasons over whatever typed emit comes back.
// No judgment-forbidden agent sits in between; these helpers are the mechanical floor.

// Merge-copy `src/.` into `dest/` (the `cp -R src/. dest/` shape): existing dest entries the source
// does not carry survive, so a worktree-only artifact (a chain receipt, per-leg evidence) is never
// dropped by the mirror. `keepExisting` names top-level entries the dest OWNS: when the dest already
// has one, the source copy is skipped rather than written over.
//
// `keepExistingRel` is the same rule keyed on a POSIX path RELATIVE TO THE MIRROR ROOT, and unlike
// `keepExisting` it is carried through the recursion. That distinction is the whole of #906-R1: the
// sentence above promised a worktree-authored chain receipt would survive, and it only did while
// MAIN happened not to carry one too. The moment both copies exist the source wins unconditionally,
// because the top-level `keepExisting` set cannot name a path inside `.cache/` and was dropped one
// frame down anyway. A mirror that overwrites a NEWER artifact with an older one is a destruction,
// not a merge — measured: an operator who runs the chains, hits a designed refusal, commits, and
// re-runs the chains ends up with the fresh receipt in the worktree and a stale one in main, and
// the next finalize copied the stale one forward and reported `chains_stale` over a tree the chains
// had just run green on. The fresh receipt was then in no copy anywhere.
function mergeCopyDir(src, dest, keepExisting, keepExistingRel, relBase) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    const rel = relBase ? relBase + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) continue;      // never follow a link out of the tree
    if (keepExisting && keepExisting.has(entry.name) && fs.existsSync(d)) continue;
    if (keepExistingRel && keepExistingRel.has(rel) && fs.existsSync(d)) continue;
    // `keepExisting` is deliberately NOT recursed (top-level names, as before); `keepExistingRel` is.
    if (entry.isDirectory()) mergeCopyDir(s, d, null, keepExistingRel, rel);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

// The durable RUN AUTHORITY the branch owns. The worktree holds the complete record and the main
// checkout is the stale one, so the mirror carries Finalization ARTIFACTS into the worktree and
// never pushes a staler authority backwards over it. `workflow-plan.md` is deliberately absent —
// the ledger-regression guard adjudicates that file explicitly (refuse, or copy a source that is at
// least as complete), which is a stronger check than skip-if-present.
const FINALIZE_MIRROR_DEST_OWNED = new Set(['workflow-state.md', 'workflow-tasks.json']);

// TREE-BOUND artifacts: produced BY a tree and only meaningful ABOUT that tree. The chain receipt
// carries a `codeTreeHash` binding it to the exact tree its chains ran over, and the outcome log is
// append-only telemetry whose rows were appended in the tree that holds it. Neither is a record one
// checkout can hold on another's behalf, so a mirror in EITHER direction may supply one to a copy
// that has none and may never write over one that exists. Both directions, because the rule is about
// the artifact, not about which way the copy happens to be going — and because a mirror that can
// destroy is a mirror that will, eventually, in whichever direction it was pointed.
//
// Keeping the destination's copy is fail-safe by construction. If the copy we keep is the stale one,
// the finalize gate says `chains_stale` and the operator re-runs the chains — a report, and every
// byte still on disk in both trees. If we overwrite, the newer copy is gone from everywhere and the
// archive carries a receipt bound to a tree that no longer exists.
const FINALIZE_MIRROR_TREE_BOUND = new Set([
  '.cache/chain-receipt.json',
  '.cache/' + adaptiveSchema.OUTCOME_LOG_NAME,
]);

// Finalization residue the orchestrator authored OUTSIDE kaola-workflow/ in the main checkout
// (CHANGELOG, docs, .env.example …) belongs on the branch too, so the commit gate can hand it to the
// sink. Copies main's dirty non-`kaola-workflow/` files into the linked worktree and returns the
// relative paths it AUTHORED. That list is machinery-manufactured state: a caller that probes the
// worktree for operator dirt must subtract it, or the transaction reads its own mirror as proof the
// operator failed to commit something (see probeImplementationCommit).
// #837: the READ-ONLY half of the residue mirror. Returns the relative paths the mirror WOULD
// author in the worktree, without copying anything, so `finalize --check` can predict the
// transaction's own manufactured dirt (and subtract it from operator dirt) without performing it.
function listResidueOutsideProject(mainRoot) {
  const rels = [];
  try {
    const status = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
    for (const rel of parsePorcelainPaths(status)) {
      if (rel.startsWith('kaola-workflow/')) continue;
      let st = null;
      try { st = fs.lstatSync(path.join(mainRoot, rel)); } catch (_) { continue; }
      if (!st.isFile()) continue;
      rels.push(rel);
    }
  } catch (_) { /* no git / unreadable status — the project-dir mirror above still stands */ }
  return rels;
}

function mirrorResidueOutsideProject(mainRoot, root) {
  const authored = [];
  for (const rel of listResidueOutsideProject(mainRoot)) {
    const to = path.join(root, rel);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(mainRoot, rel), to);
    } catch (_) { continue; }
    authored.push(rel);
  }
  return authored;
}

// Step 8a — artifact mirror. The FINAL copy direction is always main checkout → linked worktree:
// the worktree holds the complete ledger and the main copy is the one carrying the Finalization
// artifacts the orchestrator just authored. Before copying, the ledger-regression guard checks
// whether that copy would push a STALER main plan over a MORE-COMPLETE worktree ledger.
//
// #837: when it would, the transaction OWNS the repair. It merge-copies the worktree project dir
// UP into main (worktree wins), re-compares, and only then runs the main→worktree copy. That
// worktree→main sync used to be an operator `rsync -a` demanded by a typed refusal — a blocker the
// workflow manufactured for itself out of its own commit policy, so it is a repair obligation
// discharged before the gate, never an operator obligation. The refusal is RETAINED and RE-TYPED:
// it is now reachable only when the script CANNOT perform the sync it owes (`mirror_sync_failed`),
// which stays fail-closed and zero-write on the worktree side.
// Returns one of:
//   { mirror: 'not_needed' | 'source_absent' | 'skipped_post_archive' | 'mirrored',
//     ledger_compare: <token>, mirrored_paths: [<rel>…] }
//   { refused: true, inner_reason: 'mirror_sync_failed', detail }
// `mirrored_paths` names ONLY the non-`kaola-workflow/` residue this function authored in the
// worktree — the caller must treat those paths as its own, never as operator dirt.
// `mirrored_paths` names ONLY the non-`kaola-workflow/` residue this function authored in the
// worktree — the caller must treat those paths as its own, never as operator dirt.
function mirrorFinalizationArtifacts(root, project) {
  let mainRoot = null;
  try {
    mainRoot = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    if (mainRoot === fs.realpathSync(root)) return { mirror: 'not_needed', ledger_compare: 'not_needed', mirrored_paths: [] };
  } catch (_) { return { mirror: 'not_needed', ledger_compare: 'not_needed', mirrored_paths: [] }; }
  const srcDir = path.join(mainRoot, 'kaola-workflow', project);
  const destDir = path.join(root, 'kaola-workflow', project);
  // Crash-resume: once the archive step has run, the live folder is GONE on purpose. Re-mirroring
  // would resurrect it from a main copy the archive already superseded, and the transaction would
  // re-enter at the wrong step. A re-entry past the archive skips straight to the commit gate.
  // The residue OUTSIDE kaola-workflow/ is a SEPARATE obligation the commit gate still owes the
  // sink, and the archive never superseded it — so it is mirrored on this path too. Skipping it
  // silently dropped the orchestrator's CHANGELOG/doc edits from every crash-resumed run.
  if (!fs.existsSync(destDir) && findArchiveAuthorities(root, project).length > 0) {
    return {
      mirror: 'skipped_post_archive',
      ledger_compare: 'not_needed',
      mirrored_paths: mirrorResidueOutsideProject(mainRoot, root)
    };
  }
  if (!fs.existsSync(srcDir)) return { mirror: 'source_absent', ledger_compare: 'not_needed', mirrored_paths: [] };
  // Record-regression guard (fail-open on a first sync — the compare module owns that semantics).
  let ledgerCompare = 'skipped_no_record';
  const srcRecord = path.join(srcDir, adaptiveSchema.MISSION_LIST_FILE);
  if (fs.existsSync(srcRecord)) {
    try {
      const { compareLedgers } = require('./kaola-workflow-ledger-compare.js');
      let destText = null;
      try { destText = fs.readFileSync(path.join(destDir, adaptiveSchema.MISSION_LIST_FILE), 'utf8'); } catch (_) {}
      const verdict = compareLedgers(fs.readFileSync(srcRecord, 'utf8'), destText);
      if (!verdict.safe) {
        // #837 — the script performs the worktree→main sync itself. Merge-copy (worktree wins) so
        // main-only Finalization artifacts the orchestrator just authored survive, then re-compare
        // against the repaired source. A sync the script cannot perform is a MACHINE failure, not
        // an operator obligation: refuse fail-closed under the pinned top-level reason, with the
        // worktree ledger untouched (nothing has been copied INTO the worktree at this point).
        let syncFailure = null;
        try {
          mergeCopyDir(destDir, srcDir, null, FINALIZE_MIRROR_TREE_BOUND);
        } catch (e) {
          if (e instanceof TypeError || e instanceof ReferenceError) throw e;
          syncFailure = String((e && e.message) || e).slice(0, 400);
        }
        let after = null;
        if (!syncFailure) {
          try { after = compareLedgers(fs.readFileSync(srcRecord, 'utf8'), destText); }
          catch (e) { syncFailure = String((e && e.message) || e).slice(0, 400); }
        }
        if (syncFailure || !after || !after.safe) {
          return {
            refused: true,
            inner_reason: 'mirror_sync_failed',
            detail: 'the transaction could not sync the worktree project folder up into the main '
              + 'checkout (main copy records ' + verdict.sourceComplete + ' done item(s); the '
              + 'worktree copy records ' + verdict.destComplete + ')'
              + (syncFailure ? ': ' + syncFailure : '')
          };
        }
        ledgerCompare = 'synced_from_worktree';
      } else {
        ledgerCompare = 'pass';
      }
    } catch (e) {
      // A programmer error (missing/renamed export — the cross-edition drift class) must not be
      // swallowed into a silent bypass of the guard.
      if (e instanceof TypeError || e instanceof ReferenceError) throw e;
      ledgerCompare = 'skipped_no_script';
    }
  }
  // The main→worktree copy is a WRITE, and it was the one write in this function with no failure
  // path: an unwritable destination (`kaola-workflow/` read-only in the worktree) made mergeCopyDir
  // throw its raw `EACCES … mkdir` straight out of the transaction, so the operator got a node stack
  // line and NO typed envelope at all — for the mirror direction whose sibling already refuses under
  // `mirror_sync_failed` twenty lines above. Same reason, same fail-closed shape: nothing downstream
  // has run yet, so the worktree is left exactly as it was found.
  try {
    mergeCopyDir(srcDir, destDir, FINALIZE_MIRROR_DEST_OWNED, FINALIZE_MIRROR_TREE_BOUND);
  } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError) throw e;
    return {
      refused: true,
      inner_reason: 'mirror_sync_failed',
      detail: 'the transaction could not mirror the main checkout\'s project folder down into the '
        + 'linked worktree (' + destDir + '): ' + String((e && e.message) || e).slice(0, 400)
    };
  }
  return {
    mirror: 'mirrored',
    ledger_compare: ledgerCompare,
    mirrored_paths: mirrorResidueOutsideProject(mainRoot, root)
  };
}

// The machinery NEVER authors the implementation commit — that is the operator/orchestrator's job.
// A missing/uncommitted implementation is SURFACED and the transaction stops; it is never repaired
// by sweeping the change into `chore: finalize`. Positive proof is required in BOTH directions:
// only implementation-shaped dirt (a non-`kaola-workflow/` path) that sits beside a branch carrying
// NO committed non-`kaola-workflow/` change is a missing implementation commit. Anything the probe
// cannot determine reads `indeterminate` and never refuses.
// Returns { state: 'committed' | 'missing' | 'indeterminate' | 'not_applicable', paths }.
// `machineryAuthoredPaths` names worktree dirt the TRANSACTION ITSELF manufactured (the Step 8a
// residue mirror). It is subtracted before anything is read as operator dirt: state the workflow
// produced by its own commit policy is a repair obligation it already discharged, never evidence
// against the operator — reading it back as proof manufactured `implementation_commit_missing` on
// runs where there was nothing left to author.
function probeImplementationCommit(root, baseBranch, machineryAuthoredPaths) {
  const authored = new Set(Array.isArray(machineryAuthoredPaths) ? machineryAuthoredPaths : []);
  let dirty = [];
  try {
    const status = execFileSync('git', ['-C', root, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
    dirty = parsePorcelainPaths(status)
      .filter(p => !p.startsWith('kaola-workflow/') && !authored.has(p));
  } catch (_) { return { state: 'indeterminate', paths: [] }; }
  if (dirty.length === 0) return { state: 'not_applicable', paths: [] };
  const base = (baseBranch || '').trim() || 'main';
  if (!isSafeBranchArg(base)) return { state: 'indeterminate', paths: dirty };
  let committed = [];
  try {
    // `-z` because the very next statement is a `startsWith('kaola-workflow/')` classification, and
    // the non-`-z` stream cannot carry a pathname faithfully: measured, `diff --name-only` C-QUOTES a
    // path holding `"`, `\`, a control character or (by default) any non-ASCII byte — so a quoted
    // `kaola-workflow/…` path reads as NON-workflow and this probe silently concludes `committed` —
    // and it does NOT quote a trailing space, which the old `.trim()` then ate.
    const diff = execFileSync('git', ['-C', root, 'diff', '--name-only', '-z', base + '...HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
    committed = splitNulPaths(diff);
  } catch (_) { return { state: 'indeterminate', paths: dirty }; }
  let implCommitted = committed.some(p => !p.startsWith('kaola-workflow/'));
  if (!implCommitted) {
    // The NET diff is blind to work that was committed and then undone: a branch carrying
    // `feat: impl` followed by `revert: drop impl` nets to an empty non-`kaola-workflow/` diff
    // while plainly carrying implementation commits. "No implementation commit" is a claim about
    // the branch's HISTORY, so ask the history before asserting it. Widening-only — a branch the
    // net diff already proves implemented never re-reads as missing.
    try {
      // `-z` for the same reason as the net diff above. Measured on this stream specifically:
      // `log --name-only --pretty=format: -z` emits each pathname verbatim and NUL-terminated, with
      // an empty record between commits — which splitNulPaths drops, since a pathname is never empty.
      const touched = execFileSync('git', ['-C', root, 'log', '--name-only', '--pretty=format:', '-z', base + '..HEAD'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
      implCommitted = splitNulPaths(touched)
        .some(p => !p.startsWith('kaola-workflow/'));
    } catch (_) { return { state: 'indeterminate', paths: dirty }; }
  }
  return { state: implCommitted ? 'committed' : 'missing', paths: dirty.slice(0, 20) };
}

// The single-project staging rule, moved out of command prose and into the transaction. Compare
// the project name as a FIXED STRING (never a regex): a foreign project's `archive/` band or more
// than one live `kaola-workflow/<project>/` in the index means the commit must be split.
// Returns { ok: true } or { ok: false, reason, detail }.
function checkFinalizeStagingGuard(root, project) {
  let staged = [];
  try {
    // `-z`: every classification below is a prefix/segment test on the pathname, so a C-quoted path
    // is invisible to ALL of them — a quoted `kaola-workflow/archive/<other>/…` would slip past the
    // foreign-archive arm and ride along in the commit this guard exists to split.
    const out = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '-z'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
    staged = splitNulPaths(out);
  } catch (_) { return { ok: true }; }   // unprobeable index — the guard has nothing to assert
  const foreignArchive = new Set();
  const projects = new Set();
  for (const rel of staged) {
    if (!rel.startsWith('kaola-workflow/')) continue;
    const seg = rel.split('/');
    if (seg[1] === 'archive') {
      const band = seg[2] || '';
      if (band && band !== project && band.indexOf(project + '.archived-') !== 0) foreignArchive.add(band);
      continue;
    }
    if (seg[1] === '.roadmap' || seg[1] === 'ROADMAP.md' || seg.length < 3) continue;
    projects.add(seg[1]);
  }
  if (foreignArchive.size > 0) {
    return { ok: false, reason: 'staging_guard_foreign_archive', detail: Array.from(foreignArchive).sort() };
  }
  if (projects.size > 1) {
    return { ok: false, reason: 'staging_guard_multi_project', detail: Array.from(projects).sort() };
  }
  return { ok: true };
}

// The transaction's OWN bookkeeping commits. `git commit` is not a safe assumption: a commit hook
// can reject the tree and signing can fail, and an unwrapped throw here escapes as a raw stack
// trace — destroying the one thing the transaction ledger exists to provide, a re-entry that is
// readable from the emit alone. Never `--no-verify`: a hook is content inspection and must run, so
// a hook rejection is a REAL failure that surfaces typed rather than being bypassed.
// Returns { ok: true } or { ok: false, status, stderr }.
function commitFinalizeStep(root, message) {
  try {
    // stderr is PIPED (not inherited) so a rejection message can ride along in the typed refusal
    // instead of scrolling past; on success it is written straight back through, so hook advisory
    // output the operator would otherwise have seen is not swallowed.
    const r = spawnSync('git', ['-C', root, 'commit', '-m', message],
      { encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] });
    if (r.error) return { ok: false, status: null, stderr: String(r.error.message || r.error).slice(0, 1000) };
    if (r.status !== 0) {
      return { ok: false, status: r.status, stderr: String(r.stderr || '').trim().slice(0, 1000) };
    }
    if (r.stderr) process.stderr.write(String(r.stderr));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      status: (e && e.status != null) ? e.status : null,
      stderr: String((e && e.stderr) || (e && e.message) || '').trim().slice(0, 1000)
    };
  }
}

// A failed bookkeeping commit is a typed refusal CARRYING the transaction ledger, so the operator
// (and a resumed run) can read exactly which step stopped and what is already durable.
function emitFinalizeCommitFailure(project, step, committed, finalizeTx) {
  output({
    result: 'refuse',
    reason: 'finalize_commit_failed',
    step: step,
    project: project,
    exit_status: committed.status,
    detail: committed.stderr || null,
    finalize_transaction: finalizeTx,
    operator_hint: 'The `chore: ' + step + '` commit was rejected (commit hook or signing). Resolve '
      + 'the rejection, then re-run finalize — the transaction resumes at the step the '
      + 'finalize_transaction ledger reports. Nothing is bypassed: the hook is content inspection '
      + 'and must pass.',
    errors: ['finalize_commit_failed']
  }, 1);
}

// ─── #837: the finalize preconditions, evaluated as ONE checklist ─────────────────────────────
// The preconditions used to surface only as a SERIAL refusal ladder: each one was observable only
// after the previous had been cleared, so an operator paid a full finalize round-trip per unmet
// precondition and learned exactly one new fact each time. Nothing is learned one-refusal-at-a-time
// that cannot be learned in one pass, so the pass below evaluates EVERY precondition and reports
// them together. It is STRICTLY READ-ONLY — it never runs the mutating Step-8a mirror — and the
// ladder inside cmdFinalize consumes the same pure probes, so the checklist and the transaction can
// never disagree about what a rung says.

// Read-only classification of what Step 8a WILL do. Mirrors mirrorFinalizationArtifacts' own
// branch order exactly, minus every write.
//   'not_needed' | 'ready' | 'sync_required' | 'sync_failed' | 'source_absent' | 'skipped_post_archive'
// `destAuthorityAbsent` carries the one bit the state token cannot: 'ready' is reached from THREE
// distinct situations (no source record, a safe compare, and a compare that threw — compareLedgers
// fails open on a null destination), so 'ready' ALONE never means "the mirror will construct the
// authority". 'ready' AND destAuthorityAbsent does mean exactly that, which is what the authority
// prediction reads.
//
// It is the AUTHORITY FILE, not the directory. The bit used to be `!existsSync(destDir)`, which
// answers "the mirror will create the DIRECTORY" — a different question, and false for the ordinary
// shape where the worktree already carries a partial `kaola-workflow/<project>/` (a `.cache/` holding
// a chain receipt, and no `workflow-state.md`). There `--check` reported `state_missing` as an
// operator obligation for a file Step 8a copies in one statement later: the same defect the pending
// prediction exists to remove, one branch over. The predicate is now literally the copy decision
// mergeCopyDir will make — FINALIZE_MIRROR_DEST_OWNED skips `workflow-state.md` only when the
// destination ALREADY has one, so "dest has no workflow-state.md" is exactly "the mirror will write
// the authority". A dest whose state file exists but is unreadable or the wrong type is NOT repaired
// by the mirror (it is skipped as dest-owned), and reads false here, so those tokens still stand.
//
// 'ready' is a PROMISE that the copy will happen, so it is falsified the same way the sync_required
// arm is — by probing the tree that will be WRITTEN. It used to probe nothing at all on this arm
// (the writability probe existed only below, and it reads the SOURCE), so a read-only worktree
// `kaola-workflow/` produced `ok:true` + `pending_mirror` from `--check` and then an untyped mkdir
// EACCES out of the transaction one statement later. An unwritable destination is a genuine
// operator-owed precondition and reports as `sync_failed`, the token this probe already carries for
// "the mirror the script owes cannot be performed" — no new vocabulary, and the same
// `mirror_sync_failed` reason the transaction now emits for that failure.
function probeFinalizeMirror(root, project) {
  let mainRoot = null;
  try {
    mainRoot = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    if (mainRoot === fs.realpathSync(root)) return { state: 'not_needed', mainRoot: null, destAuthorityAbsent: false };
  } catch (_) { return { state: 'not_needed', mainRoot: null, destAuthorityAbsent: false }; }
  const srcDir = path.join(mainRoot, 'kaola-workflow', project);
  const destDir = path.join(root, 'kaola-workflow', project);
  // The DIRECTORY bit is local to the crash-resume branch below, which mirrors
  // mirrorFinalizationArtifacts' own `!fs.existsSync(destDir)` test and must keep doing so. The bit
  // the prediction reads is a different question, and is the one that leaves this function.
  const destAbsent = !fs.existsSync(destDir);
  const destAuthorityAbsent = !fs.existsSync(path.join(destDir, 'workflow-state.md'));
  if (destAbsent && findArchiveAuthorities(root, project).length > 0) {
    return { state: 'skipped_post_archive', mainRoot, destAuthorityAbsent };
  }
  if (!fs.existsSync(srcDir)) return { state: 'source_absent', mainRoot, destAuthorityAbsent };
  // What 'ready' promises: mergeCopyDir mkdirs destDir and copies into it. Probed once, here, so
  // every 'ready' return below carries the same answer.
  const ready = mirrorDestWritable(destDir) ? 'ready' : 'sync_failed';
  const srcRecord = path.join(srcDir, adaptiveSchema.MISSION_LIST_FILE);
  if (!fs.existsSync(srcRecord)) return { state: ready, mainRoot, destAuthorityAbsent };
  try {
    const { compareLedgers } = require('./kaola-workflow-ledger-compare.js');
    let destText = null;
    try { destText = fs.readFileSync(path.join(destDir, adaptiveSchema.MISSION_LIST_FILE), 'utf8'); } catch (_) {}
    const verdict = compareLedgers(fs.readFileSync(srcRecord, 'utf8'), destText);
    if (verdict.safe) return { state: ready, mainRoot, destAuthorityAbsent };
    // A pending worktree→main sync is machinery-repairable, so it is REPORTED as state, never as an
    // operator-owed precondition — unless the destination is provably unwritable, in which case the
    // transaction will hit the fail-closed mirror_sync_failed refusal and the operator should know.
    let writable = true;
    try {
      fs.accessSync(srcDir, fs.constants.W_OK);
      if (fs.existsSync(srcRecord)) fs.accessSync(srcRecord, fs.constants.W_OK);
    } catch (_) { writable = false; }
    return { state: writable ? 'sync_required' : 'sync_failed', mainRoot, destAuthorityAbsent };
  } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError) throw e;
    return { state: ready, mainRoot, destAuthorityAbsent };
  }
}

// Can Step 8a's main→worktree copy actually write? `mergeCopyDir` mkdirs `destDir` recursively, so
// the question is about the NEAREST EXISTING ancestor when the destination itself is absent — which
// is precisely the `pending_mirror` topology, where nothing at `destDir` exists to probe. Only a
// proven refusal answers false: an unprobeable path (walked past the filesystem root) reads writable,
// because a probe fault must not manufacture a precondition the operator cannot act on.
function mirrorDestWritable(destDir) {
  let probe = destDir;
  for (;;) {
    if (fs.existsSync(probe)) {
      try { fs.accessSync(probe, fs.constants.W_OK); return true; } catch (_) { return false; }
    }
    const parent = path.dirname(probe);
    if (!parent || parent === probe) return true;
    probe = parent;
  }
}

// The workflow_state rung as a pure resolution. Returns the authority the rest of the transaction
// reads, plus the inner reason when no authority can be proven.
function resolveFinalizeAuthority(root, project) {
  const liveDir = projectDir(root, project);
  let livePresent = false;
  try {
    fs.lstatSync(liveDir);
    livePresent = true;
  } catch (error) {
    // Only a genuinely absent directory enters the source-missing crash-resume
    // path. An unreadable entry remains live authority and fails type proof below.
    livePresent = !error || error.code !== 'ENOENT';
  }
  const candidates = livePresent ? [liveDir] : findArchiveAuthorities(root, project);
  const authorityDir = candidates.length === 1 ? candidates[0] : null;
  const statePath = authorityDir ? path.join(authorityDir, 'workflow-state.md') : null;
  let authorityState = '';
  let innerReason = null;
  if (!livePresent && candidates.length > 1) {
    innerReason = 'archive_authority_ambiguous';
  } else if (!authorityDir) {
    innerReason = 'archive_authority_missing';
  } else {
    let authorityStat = null;
    try { authorityStat = fs.lstatSync(authorityDir); } catch (_) {}
    if (!authorityStat || !authorityStat.isDirectory() || authorityStat.isSymbolicLink()) {
      innerReason = 'archive_authority_invalid_type';
    }
    let stateStat = null;
    try { if (!innerReason) stateStat = fs.lstatSync(statePath); }
    catch (error) { innerReason = error && error.code === 'ENOENT' ? 'state_missing' : 'state_unreadable'; }
    if (!innerReason && (!stateStat || !stateStat.isFile() || stateStat.isSymbolicLink())) {
      innerReason = 'state_invalid_type';
    }
    if (!innerReason) {
      try { authorityState = fs.readFileSync(statePath, 'utf8'); }
      catch (_) { innerReason = 'state_unreadable'; }
    }
    if (!innerReason && !livePresent && field(authorityState, 'status') !== 'closed') {
      innerReason = 'archive_state_not_closed';
    }
  }
  return { livePresent, authorityDir, authorityState, innerReason };
}

// The workflow_state rung's operator hint, kept in ONE place so the ladder emit and the checklist
// can never drift apart.
function finalizeAuthorityHint(livePresent, innerReason) {
  if (livePresent) {
    return 'Restore workflow-state.md as a readable regular file before Finalization. No archive or closure side effect was made.';
  }
  if (innerReason === 'archive_state_not_closed') {
    return 'Restore the live project and complete Finalization from its verified gates. Only an archive already stamped status: closed by the finalize transaction may resume source-missing; no closure side effect was made.';
  }
  if (innerReason === 'archive_authority_ambiguous') {
    return 'Multiple exact/suffixed archives match this project, so no current transaction authority can be proven. Restore the live project or retain exactly the archive for the interrupted finalize transaction; no closure side effect was made.';
  }
  return 'Restore a valid archived workflow-state.md authority before resuming Finalization. No closure side effect was made.';
}

// The authority ONE STATEMENT INTO the transaction, not the authority as it stands right now.
// cmdFinalize runs Step 8a BEFORE it resolves the authority, and on the ordinary linked-worktree
// topology — run folder resident in the main checkout, worktree not yet carrying it — that mirror
// CREATES the live folder the resolution then reads. The read-only checklist resolves over the
// PRE-mirror tree, so it saw no authority at all and reported `archive_authority_missing`: an
// operator obligation for a step the script performs itself, unasked, one line later. A pending
// mirror is machinery-repairable exactly as a pending worktree→main sync is, so it is REPORTED as
// state (`pending_mirror`) and never pushed into `reasons` — the same rule probeFinalizeMirror
// already applies to `sync_required`.
//
// The authority is NOT relocated to the main root: `dest_dir` stays the tree the transaction will
// read, and only the state file the mirror is about to copy is read out of the source. A prediction
// naming main as the authority would disagree with execution — the same defect, inverted. Anything
// the mirror will NOT construct (no source to copy, an archive already standing in, an in-place run)
// is left exactly as resolved, so a genuinely absent or ambiguous authority still fails closed.
// Returns { authority, pending, topology }: the resolution the checklist reports, whether the mirror
// is what constructs it, and the two roots plus source/destination the prediction was made over.
//
// TWO inner reasons are converted, because the mirror repairs both and they are the same tree seen at
// two stages: nothing at the destination (`archive_authority_missing`), and a destination folder that
// exists WITHOUT the state file (`state_missing`) — the ordinary shape as soon as anything has written
// a `.cache/` into the worktree. Restricting the conversion to the first left `state_missing` standing
// as an operator obligation for a file Step 8a copies one statement later. No other token is
// converted: `state_unreadable`, `state_invalid_type` and `archive_authority_ambiguous` all describe a
// destination the mirror will NOT overwrite (`FINALIZE_MIRROR_DEST_OWNED` skips an existing state
// file) or cannot disambiguate, so they still fail closed.
function predictFinalizeAuthority(root, project, mirror) {
  const resolved = resolveFinalizeAuthority(root, project);
  let authority = resolved;
  let pending = false;
  if ((resolved.innerReason === 'archive_authority_missing' || resolved.innerReason === 'state_missing')
    && mirror.mainRoot && mirror.state === 'ready' && mirror.destAuthorityAbsent) {
    // Resolve over the source Step 8a is about to copy — the same content the post-mirror
    // resolution will read. Only a LIVE source in main is a construction this can promise; a source
    // that itself resolves to an archive, or to nothing, leaves the original answer standing.
    const predicted = resolveFinalizeAuthority(mirror.mainRoot, project);
    if (predicted.livePresent) {
      authority = predicted;
      pending = true;
    }
  }
  // Fail-open on the roots, as resolveMainRoot does: an unresolvable main root reads as the run root.
  let runRoot = root;
  try { runRoot = fs.realpathSync(root); } catch (_) {}
  const topology = {
    main_root: mirror.mainRoot || runRoot,
    linked_root: mirror.mainRoot ? runRoot : null,
    source: 'none',
    source_dir: null,
    dest_dir: null
  };
  if (authority.authorityDir) {
    topology.source = pending ? 'pending_mirror' : (authority.livePresent ? 'live' : 'archive');
    topology.source_dir = authority.authorityDir;
    topology.dest_dir = pending ? projectDir(root, project) : authority.authorityDir;
  }
  return { authority, pending, topology };
}

// THE FINALIZE REPORT. Two measurements, neither of which refuses.
//
// (A) VALIDATION — did this repo's own tests pass over THIS tree? Answered from artifacts this
//     workflow produced (a chain receipt, or the agent's recorded final-validation evidence) with
//     no external pipeline in the loop, computed IN PROCESS: no subprocess, no plan path, no plan.
//     Read-only — the landable-tree snapshot it takes lives in an index OUTSIDE the repo.
//
//     It used to slam the door. It no longer does. The chain receipt is exactly the content-bound
//     witness the publication refusal was named for, and that refusal converts like all the others:
//     delete the verdict, keep the measurement. The finding is reported on the envelope and written
//     durably into finalization-summary.md; the orchestrator reads it and owns the outcome — re-run
//     the chains, fix the red, or proceed knowingly. What is NOT weakened is who computes the
//     answer: it is still this workflow's own chains, never a system we do not own.
//
// (B) THE CHANGED-PATH REPORT — this used to be an attribution sweep that compared the branch diff
//     against declared write sets and refused the remainder. Declared write sets are gone; a
//     free-text result is not a path set, and parsing one back into one would re-invent the
//     declaration. So the comparison goes and the measurement stays.
//
// For both: the durable write is not optional. A conversion that emits a finding and drops the
// state the refusal was freezing is a deletion, not a conversion.
//
// A missing run record is not an error either: the mission list is a convention, not a
// precondition, and neither measurement reads it.
//
// Returns { validation, changed_paths, changed_paths_probe } — no ok, because there is nothing here
// to fail.
function probeFinalizeValidationGate(root, authorityDir, authorityState, base) {
  const cacheDir = path.join(authorityDir, '.cache');
  // The candidate under validation is the working tree the caller invoked from, which on a
  // source-missing resume is NOT the tree the archived run folder sits in.
  const gateRoot = adaptiveSchema.resolveFinalizeCheckRoot(root);
  const project = path.basename(authorityDir);
  const validation = adaptiveSchema.evaluateChainReceipt(gateRoot, { cacheDir, project });
  // `base` scopes the diff to a project's OWN divergence on a shared multi-issue branch. A git
  // failure yields null — reported as "not measured", never as a verdict either way.
  const changed = adaptiveSchema.changedPathsSinceBase(gateRoot, base || 'main', project);
  return {
    validation,
    changed_paths: changed || [],
    changed_paths_probe: changed === null ? 'unavailable' : 'measured',
  };
}

// The durable half of the two reports. `## Validation` and `## Changed Paths` in the run's
// finalization-summary.md are where the measurements outlive the process that took them — without
// them the conversion from refusal to report would be a deletion. Both are idempotent across a
// crash-resumed re-entry (the heading is checked first) and swallow-on-error, like the other
// summary writers: they record measurements, so they must never be able to fail a finalize.
function appendSummarySection(projectDir, heading, lines) {
  try {
    const p = path.join(projectDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { /* create-if-absent */ }
    if (new RegExp('^' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm').test(s)) return false;
    const block = [heading, ''].concat(lines).join('\n') + '\n';
    writeFile(p, s ? (s.trimEnd() + '\n\n' + block) : block);
    return true;
  } catch (_) { return false; }
}
function persistValidationToSummary(projectDir, validation) {
  const v = validation || {};
  const lines = ['classification: ' + (v.classification || 'unknown'),
    'green: ' + (v.green === true)];
  if (v.mode) lines.push('mode: ' + v.mode);
  for (const d of (v.detail || [])) lines.push('', d);
  if (!v.green && v.operator_hint) lines.push('', v.operator_hint);
  return appendSummarySection(projectDir, '## Validation', lines);
}
function persistChangedPathsToSummary(projectDir, changed, probe) {
  const lines = [];
  if (probe === 'unavailable') {
    lines.push('not measured — the branch diff could not be enumerated.');
  } else if (!changed || !changed.length) {
    lines.push('none outside the run-state and documentation bands.');
  } else {
    lines.push('Files this branch changed outside the run-state and documentation bands:', '');
    for (const rel of changed) lines.push('- ' + rel);
  }
  return appendSummarySection(projectDir, '## Changed Paths', lines);
}

// ONE pass over EVERY finalize precondition. Returns { checks, reasons, authority }:
//   checks.mirror                — what Step 8a will do (never performed here)
//   checks.workflow_state        — 'ok', 'pending_mirror' (Step 8a constructs the authority), or the
//                                  workflow_state rung's inner reason
//   checks.implementation_commit — the probe state, or 'not_checked' outside the commit-gate lane
//   checks.staging_guard         — 'ok' or the guard's reason
//   checks.validation            — the validation CLASSIFICATION ('chains_green' when green)
//   checks.dirty_paths           — uncommitted non-`kaola-workflow/` paths in the run root
//   authority                    — { main_root, linked_root, source, source_dir, dest_dir }: the
//                                  topology the answers above were predicted over, so a reader can
//                                  see WHICH tree each one came from
// `reasons` carries the MOST SPECIFIC token per UNMET precondition — an inner reason wherever the
// ladder has one — and is EMPTY when the run is finalize-ready. Nothing here short-circuits: a
// failed rung never hides a later one, which is the whole point of the subtraction. A pending
// worktree→main sync is machinery-repairable and is therefore reported as state, never as a reason;
// so is a pending main→worktree mirror that will CONSTRUCT the authority (`pending_mirror`). What a
// reader acts on is `reasons`; what the script still owes itself is a state token in `checks`.
//
// The validation rung is REPORTED, never a reason: it stopped being a precondition when it stopped
// being a verdict. A non-green classification shows up in `checks.validation` for a reader to act
// on, and does not make `ok` false — otherwise `--check` would still be the door this conversion
// removed, one surface over.
function evaluateFinalizePreconditions(root, project, opts) {
  const options = opts || {};
  const reasons = [];
  const checks = {
    mirror: 'not_needed',
    workflow_state: 'ok',
    implementation_commit: 'not_checked',
    staging_guard: 'ok',
    validation: 'not_checked',
    changed_paths: [],
    dirty_paths: []
  };

  const mirror = probeFinalizeMirror(root, project);
  checks.mirror = mirror.state;
  if (mirror.state === 'sync_failed') reasons.push('mirror_sync_failed');

  // Dirt the transaction's own Step-8a residue mirror WILL manufacture in the worktree. Subtracted
  // before anything is read as operator dirt: state the workflow produces by its own commit policy
  // is a repair obligation it already discharged, never evidence against the operator.
  const wouldMirror = mirror.mainRoot ? listResidueOutsideProject(mirror.mainRoot) : [];
  const authored = new Set(wouldMirror);
  try {
    const status = execFileSync('git', ['-C', root, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER });
    checks.dirty_paths = parsePorcelainPaths(status)
      .filter(p => !p.startsWith('kaola-workflow/') && !authored.has(p));
  } catch (_) { checks.dirty_paths = []; }

  // The authority as the TRANSACTION will find it: Step 8a runs before it resolves one, and may be
  // what constructs it. A construction the script owns is state, never an operator obligation.
  const prediction = predictFinalizeAuthority(root, project, mirror);
  const authority = prediction.authority;
  if (authority.innerReason) {
    checks.workflow_state = authority.innerReason;
    reasons.push(authority.innerReason);
  } else if (prediction.pending) {
    checks.workflow_state = 'pending_mirror';
  }

  // The implementation-commit and staging rungs are scoped exactly as the transaction scopes them:
  // to the lane that owns the commit gate (a --keep-worktree run in a linked worktree). An in-place
  // run's dirt belongs to the orchestrator, so both rungs read 'not_checked'/'ok' there.
  if (options.keepWorktree) {
    let linked = false;
    try { linked = fs.realpathSync(mainRootFromCoord(getCoordRoot(root))) !== fs.realpathSync(root); }
    catch (_) { linked = false; }
    if (linked) {
      const implProbe = probeImplementationCommit(root, field(authority.authorityState, 'base_branch'), wouldMirror);
      checks.implementation_commit = implProbe.state;
      if (implProbe.state === 'missing') reasons.push('implementation_commit_missing');
      const guard = checkFinalizeStagingGuard(root, project);
      if (!guard.ok) {
        checks.staging_guard = guard.reason;
        reasons.push(guard.reason);
      }
    }
  }

  // The validation measurement needs a proven authority to locate the run's `.cache/` from. Without
  // one the workflow_state rung above already owns the refusal, so report it as unevaluated rather
  // than inventing a second answer for the same missing artifact. A PREDICTED authority carries the
  // same `.cache/` the mirror is about to copy, so the measurement is available there too — it used
  // to be lost to `not_checked` purely because the rung above had not looked in the right tree yet.
  if (!authority.authorityDir) {
    checks.validation = 'not_checked';
  } else {
    const report = probeFinalizeValidationGate(root, authority.authorityDir, authority.authorityState,
      options.base || null);
    checks.validation = (report.validation && report.validation.classification) || 'not_checked';
    checks.changed_paths = report.changed_paths;
  }

  return { checks, reasons, authority: prediction.topology };
}
function cmdFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  // #837: `--check` is the one-pass PRE-FLIGHT — every precondition evaluated together, read-only,
  // zero side effect, emitted in cmdVerifySink's { project, ok, checks, reasons } shape plus the
  // `authority` topology the answers were predicted over. It is an ADDED surface, never a
  // replacement: the transaction below keeps every one of its own fail-closed gates, so a caller
  // that skips the pre-flight is refused exactly as before.
  if (args.check) {
    const report = evaluateFinalizePreconditions(root, args.project, {
      keepWorktree: !!args.keepWorktree,
      base: args.base || (process.env.KAOLA_FINALIZE_BASE || '').trim() || null
    });
    const ok = report.reasons.length === 0;
    output({
      project: args.project, ok, checks: report.checks, reasons: report.reasons,
      authority: report.authority
    }, ok ? 0 : 1);
    return;
  }
  // #816: the transaction ledger — one object recording every step of the mechanical residue, so
  // a crash-resumed re-entry (pre-archive / post-archive-pre-commit / post-commit) is observable
  // from the emit alone.
  const finalizeTx = {
    mirror: 'not_needed',
    ledger_compare: 'not_needed',
    residue_mirrored: 0,
    impl_commit: 'not_checked',
    roadmap_staged: false,
    archive_commit: 'skipped',
    // #907: the residue STAGING step, reported separately from the commit it feeds. It used to have
    // no ledger entry at all, which is how a `git add` that exited 128 and staged nothing could be
    // followed by `finalize_commit: 'nothing_to_commit'` — a true statement about the index and a
    // false one about the run. 'skipped' = no residue to stage (or the lane never ran).
    residue_stage: 'skipped',
    // #907: the archive-bookkeeping STAGING step (the `git rm --cached` + `git add` pair that feeds
    // `chore: archive`), reported for the same reason as residue_stage. 'skipped' = nothing to stage.
    archive_stage: 'skipped',
    finalize_commit: 'skipped'
  };
  // #907: EVERY mechanical fault this transaction observes, collected in one place. The owner's
  // ruling is report-do-not-refuse, and a report has two halves — a typed token on the envelope and a
  // durable line in the archived run record. The accumulator exists because the durable half is
  // written by appendSummarySection, which is idempotent BY HEADING: a per-fault write would land the
  // first fault and silently drop every one after it, which is the same silence this converts. So the
  // faults are collected and flushed ONCE, and flushed at every exit from the block below — including
  // the refusing ones, or a run that refuses downstream would lose the findings it had already made.
  const finalizeFindings = [];
  const recordFinalizeFinding = (type, summary, lines) => {
    finalizeFindings.push({ type: type, summary: summary, lines: lines || [] });
  };
  let finalizeFindingsFlushed = false;
  const flushFinalizeFindings = () => {
    if (finalizeFindingsFlushed || finalizeFindings.length === 0) return;
    finalizeFindingsFlushed = true;
    // De-duplicated on the envelope (one broken index makes several steps fail with the same fault),
    // never in the durable body — each entry there names which step it was.
    finalizeTx.findings = Array.from(new Set(finalizeFindings.map(f => f.type)));
    if (!result || !result.dest) return;   // no archive to write into; the envelope half still stands
    const lines = [];
    for (const f of finalizeFindings) {
      lines.push('### ' + f.type, '', f.summary, '');
      for (const l of f.lines) lines.push(l);
      lines.push('');
    }
    appendSummarySection(result.dest, '## Finalize Findings', lines);
  };
  // One wording for a git failure's diagnosis, so the envelope and the archived record say the same
  // thing about the same fault. `stderr` is present only where the call pipes it.
  const gitFaultDetail = e => String((e && (e.stderr || e.message)) || e).trim().slice(0, 1000);
  // #920: which of `paths` did NOT reach the index, READ from the index rather than assumed. A failed
  // `git add` says nothing about what it staged: measured on git 2.54.0, a gitignored path beside an
  // addable one exits 1 having staged the addable one, while an unmatched pathspec exits 128 having
  // staged nothing. The messages here used to assert `git add` is all-or-nothing over its pathspec
  // list and name every candidate as unstaged, which is false in the first case and told the operator
  // to repair an index that already held the file. Returns null when the probe itself fails — the
  // caller then says nothing about the staged set rather than guessing, which is the honest answer.
  const pathsNotStaged = (root, paths) => {
    if (!paths.length) return [];
    let staged;
    try {
      staged = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '--', ...paths],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
    } catch (_) { return null; }
    // A candidate may be a directory, so it counts as staged when anything beneath it staged.
    return paths.filter(p => !staged.includes(p) && !staged.some(s => s.startsWith(p.replace(/\/$/, '') + '/')));
  };
  // Worktree dirt this transaction manufactured (Step 8a residue mirror) — subtracted from the
  // implementation probe so the machinery never reads its own mirror as operator dirt.
  let mirroredResiduePaths = [];
  // Step 8a — artifact mirror, BEFORE any gate reads the authority and before any side effect.
  // #837: a staler main copy is REPAIRED here (the transaction syncs worktree→main itself); the
  // refusal survives only for a sync the script cannot perform, and stays zero-write on the
  // worktree side — the complete worktree ledger is never overwritten with a staler main copy.
  {
    const mirror = mirrorFinalizationArtifacts(root, args.project);
    if (mirror.refused) {
      output({
        result: 'refuse',
        reason: 'finalize_mirror_refused',
        inner_reason: mirror.inner_reason,
        project: args.project,
        detail: mirror.detail,
        operator_hint: 'The transaction owns the project-folder sync between the main checkout and '
          + 'the linked worktree, in BOTH directions, and could not perform it — one of the two '
          + 'trees is unwritable, or the main copy could not be repaired. `detail` names the tree '
          + 'and the error. Make that tree writable, then re-run finalize. Never hand-copy a staler '
          + 'main ledger over the worktree. No archive or closure side effect was made.',
        errors: [mirror.inner_reason]
      }, 1);
      return;
    }
    finalizeTx.mirror = mirror.mirror;
    finalizeTx.ledger_compare = mirror.ledger_compare;
    mirroredResiduePaths = Array.isArray(mirror.mirrored_paths) ? mirror.mirrored_paths : [];
    finalizeTx.residue_mirrored = mirroredResiduePaths.length;
  }
  const folder = activeByProject(root, args.project);
  // Finalization may legitimately resume after archiveProjectDir has already moved the live
  // source, but plan absence must never turn a malformed LIVE source into that crash-resume
  // exemption. Prove that the selected authority has a readable regular state file before any
  // gate or archive side effect. A source-missing archive is a narrow crash-resume exemption:
  // archiveProjectDir must already have terminal-stamped it closed before the rename. An active,
  // abandoned, or otherwise nonterminal manual move is not proof that the live finalize gates ran.
  // #837: resolved by the SAME pure helper the one-pass `--check` report reads, so the checklist
  // and the ladder can never disagree about this rung.
  const finalizeAuthority = resolveFinalizeAuthority(root, args.project);
  const finalizeLiveSourcePresent = finalizeAuthority.livePresent;
  const finalizeAuthorityDir = finalizeAuthority.authorityDir;
  const finalizeAuthorityState = finalizeAuthority.authorityState;
  if (finalizeAuthority.innerReason) {
    output({
      result: 'refuse',
      reason: 'finalize_gate_unverified',
      gate: 'workflow_state',
      inner_reason: finalizeAuthority.innerReason,
      operator_hint: finalizeAuthorityHint(finalizeLiveSourcePresent, finalizeAuthority.innerReason),
      errors: [finalizeAuthority.innerReason]
    }, 1);
    return;
  }
  const projectInfo = folder ? { full_name: folder.full_name, html_url: folder.project_html_url } : discoverProjectSafe();
  // #336: keep-open terminal mode — explicit flag OR the durable ## Sink issue_action field.
  // State-field derivation makes the durable record the source of truth (a caller that
  // forgets the flag cannot silently close-mode the run); the flag covers the crash-resume case
  // where the live state file is already archived (archiveProjectDir returns source-missing
  // without reading state).
  let keepIssueOpen = !!args.keepOpen;
  if (!keepIssueOpen) {
    try {
      keepIssueOpen = field(fs.readFileSync(stateFile(root, args.project), 'utf8'), 'issue_action') === 'comment_keep_open';
    } catch (_) {}
  }
  // #617: merge-lane close-deferral must not rest ENTIRELY on the caller remembering
  // --keep-worktree — mirror the keepIssueOpen derivation immediately above and read the
  // durable `sink:` field too. sink defaults to 'merge' (the two-stage lane: cmdFinalize defers
  // its own close and the merge sink — sink-merge or the legacy pipeline — performs the real
  // close only AFTER the branch is verified merged); only an explicit `sink: pr` run defers
  // solely to the flag. An unreadable/absent field fails TOWARD deferral (never a premature
  // close) — a caller that forgot --keep-worktree on a merge-lane run can no longer close the
  // issue before the merge, the exact 2026-07-06 incident (#617).
  let mergeLaneDeferred = !!args.keepWorktree;
  if (!mergeLaneDeferred) {
    try {
      mergeLaneDeferred = field(fs.readFileSync(stateFile(root, args.project), 'utf8'), 'sink') !== 'pr';
    } catch (_) { mergeLaneDeferred = true; }
  }
  // #816: the machinery never authors the IMPLEMENTATION commit. Probed here — before the archive
  // rename, the closure, and the commit gate — so a missing implementation commit is SURFACED with
  // zero side effect and never quietly swept into `chore: finalize`. Scoped to the lane that owns
  // the commit gate (a linked-worktree run); an in-place run's dirt belongs to the orchestrator.
  if (args.keepWorktree) {
    let linkedForImplProbe = false;
    try { linkedForImplProbe = fs.realpathSync(mainRootFromCoord(getCoordRoot(root))) !== fs.realpathSync(root); }
    catch (_) { linkedForImplProbe = false; }
    if (linkedForImplProbe) {
      const implProbe = probeImplementationCommit(root, field(finalizeAuthorityState, 'base_branch'),
        mirroredResiduePaths);
      finalizeTx.impl_commit = implProbe.state;
      if (implProbe.state === 'missing') {
        output({
          result: 'refuse',
          reason: 'implementation_commit_missing',
          project: args.project,
          uncommitted_paths: implProbe.paths,
          operator_hint: 'The branch carries no implementation commit while implementation-shaped '
            + 'changes are uncommitted. Author the implementation commit yourself, then re-run '
            + 'finalize. The machinery authors only the finalize bookkeeping commit; no archive or '
            + 'closure side effect was made.',
          errors: ['implementation_commit_missing']
        }, 1);
        return;
      }
      // The single-project staging rule, checked BEFORE any side effect (a pure index read) so a
      // commit that would have to be split is surfaced with nothing yet archived or closed.
      const guard = checkFinalizeStagingGuard(root, args.project);
      if (!guard.ok) {
        output({
          result: 'refuse',
          reason: guard.reason,
          project: args.project,
          staged: guard.detail,
          operator_hint: 'Split the commit: the index carries workflow state that does not belong '
            + 'to this project. Unstage it, then re-run finalize. No archive or closure side effect was made.',
          errors: [guard.reason]
        }, 1);
        return;
      }
    }
  }
  // THE TWO FINALIZE REPORTS — taken BEFORE the archive moves the folder, so both land in the copy
  // that is kept:
  //   validation    — SELF-HOST (npm): the chain receipt over THIS tree. CONSUMER (non-npm): the
  //                   agent-recorded .cache/final-validation.md, bound to the candidate it
  //                   validated. Classified, never enforced.
  //   changed_paths — what this branch touched outside the run-state and documentation bands.
  // NEITHER refuses, and neither is allowed to: a finalize whose receipt is stale, red or missing
  // still completes, carrying the finding where the orchestrator will read it. That party owns the
  // outcome — re-run the chains, fix the red, or proceed knowingly.
  // #837: probed by the SAME pure helper the one-pass `--check` report reads. `--base` is sourced
  // from the flag and/or KAOLA_FINALIZE_BASE env, defaulting to `main`.
  let finalizeValidation = null;
  let finalizeChangedPaths = [];
  let finalizeChangedProbe = 'measured';
  {
    const report = probeFinalizeValidationGate(root, finalizeAuthorityDir, finalizeAuthorityState,
      args.base || (process.env.KAOLA_FINALIZE_BASE || '').trim() || null);
    finalizeValidation = report.validation;
    finalizeChangedPaths = report.changed_paths || [];
    finalizeChangedProbe = report.changed_paths_probe || 'measured';
    persistValidationToSummary(finalizeAuthorityDir, finalizeValidation);
    persistChangedPathsToSummary(finalizeAuthorityDir, finalizeChangedPaths, finalizeChangedProbe);
  }
  const result = archiveProjectDirSafely(root, args.project, 'closed', undefined, { keepOpen: keepIssueOpen, keepRoadmapSource: keepIssueOpen, keepWorktree: args.keepWorktree });
  if (!closureContract.archiveSucceeded(result) && result.archive_incomplete !== true) {
    output({ result: 'refuse', reason: result.reason || 'archive_refused',
      project: args.project, detail: result.detail,
      reasoning: 'archival did not return an explicit success result; no roadmap, issue, label, worktree, or branch cleanup was performed.' }, 1);
    return;
  }
  if (result.skipped === 'source-missing') result.dest = result.dest || finalizeAuthorityDir;
  // #676: receipt honesty — an archive copy that does not faithfully reproduce the live source
  // (verifyArchiveComplete refused BEFORE deleting the live copy/copies, because the DEST either
  // dropped a file the SOURCE held or reproduced one unfaithfully) must halt finalize here, before
  // any downstream side effect (roadmap source removal, issue close, claim-label removal). Without
  // this, cmdFinalize would fabricate a status:'closed' receipt while archived:false/
  // archive_incomplete:true sat right beside it, and would still close the issue / remove the
  // roadmap source for a run whose archive silently lost or corrupted evidence. The live folder(s)
  // already survived (that is the whole point of the pre-deletion gate); this just refuses to lie
  // about it.
  if (result.archive_incomplete === true) {
    // Report BOTH halves. An archive can be incomplete without dropping anything: a source entry
    // that is not a plain file lands in the destination as one, so the bytes and the name are
    // right while the entry is not — missing[] stays empty and mismatched[] names it. Reporting
    // only missing[] told the operator the archive 'dropped evidence' and then handed them an
    // empty list, which is both wrong and unactionable.
    const missing = Array.isArray(result.missing) ? result.missing : [];
    const mismatched = Array.isArray(result.mismatched) ? result.mismatched : [];
    output({
      result: 'refuse',
      reason: 'archive_incomplete',
      project: args.project,
      missing,
      mismatched,
      dest: result.dest,
      reasoning: (missing.length > 0
        ? 'the archive copy dropped evidence a live project folder still held (' + missing.join(', ') + ')'
        : 'the archive copy does not faithfully reproduce the live project (' +
          (mismatched.join(', ') || 'unknown') + ')') +
        '; every live project folder was left in place — no roadmap/issue/label side effect was ' +
        'performed. The archive must reproduce every file the source contains, byte for byte and '  +
        'entry kind for entry kind. ' + archiveIncompleteRemedy(root, args.project)
    }, 1);
    return;
  }
  // #426: resolve main/linked roots in cmdFinalize scope for backstop + removeWorktree + anchored_root.
  let cmdFinalizeMainRoot, cmdFinalizeLinkedRoot;
  try {
    cmdFinalizeMainRoot   = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    cmdFinalizeLinkedRoot = fs.realpathSync(root);
  } catch (_) { cmdFinalizeMainRoot = null; }
  const cmdFinalizeIsLinkedRun = !!(cmdFinalizeMainRoot && cmdFinalizeMainRoot !== cmdFinalizeLinkedRoot);
  // #333: manual-archive backstop — live folder already gone but an archived copy exists with a
  // non-terminal state (a manual `mv`/`git mv` bypassed archiveProjectDir). Stamp the archived
  // state terminal in place. Idempotent; swallow-on-error like the archive writes.
  // (port: stampTerminalState(raw, …) directly — NO removeLegacyStateBlocks in this edition.)
  let archiveStateStamped = 'not_needed';
  if (result.skipped === 'source-missing') {
    try {
      // #426: backstop destDir is worktree-aware — non-keep-worktree linked run archives to main;
      // keep-worktree linked run archives to the linked worktree (will merge into main later).
      const destDir = result.dest || finalizeAuthorityDir;
      const destState = path.join(destDir, 'workflow-state.md');
      if (fs.existsSync(destState)) {
        const raw = fs.readFileSync(destState, 'utf8');
        const st = field(raw, 'status');
        // NOT REACHED FROM cmdFinalize TODAY, and kept deliberately. On this path `destDir` resolves
        // to `finalizeAuthorityDir` (assigned a few lines above), and resolveFinalizeAuthority already
        // refused `archive_state_not_closed` against this exact file before the transaction started —
        // so `st` is terminal here and every run reports `archive_state_stamped: "not_needed"`. It
        // stays because it is a CRASH-REPAIR backstop: its whole job is a state the ordinary path does
        // not produce, and "the ordinary path cannot produce it" is the weakest possible argument for
        // removing one. No observed failure demands the subtraction, so it is recorded, not made.
        if (st !== 'closed' && st !== 'abandoned') {
          // Atomic (same crash-safe writer as archiveProjectDir): this backstop exists precisely to
          // repair a state file a crash left non-terminal — writing it non-atomically could tear the
          // very file it is repairing and hide the ARCHIVED project from readActiveFolders.
          writeFile(destState,
            stampTerminalState(raw, 'closed', { keepOpen: keepIssueOpen }));
          archiveStateStamped = 'repaired';
        }
        // lets the ## Closure append + invariants + issue_number fallback see the dir
        result.dest = result.dest || destDir;
        // #395.4: worktree variant — clear a surviving MAIN-root live copy on re-run.
        //
        // #906: it MOVES the folder ASIDE; it no longer deletes it. The obligation is about the CLAIM,
        // not the bytes: stop readActiveFolders claiming the project. It used to discharge that by
        // `fs.rmSync`ing main's live folder with no comparison against the archive at all — the sibling
        // delete in archiveProjectDir compares that exact pair first, this one never did — so every file
        // main held that the archive did not was lost from everywhere at exit 0, with
        // `closure_invariants: ok` beside it. Measured over one identical state: refusing leaves a
        // permanent phantom claim on main; deleting clears the claim and destroys the evidence; MOVING
        // clears the claim (readActiveFolders skips the `archive` band outright) and keeps every byte.
        //
        // WHERE it moves matters, and both constraints were measured:
        //   * INSIDE the resolved archive authority, never beside it. findArchiveAuthorities matches
        //     archive-band entries by NAME (`<project>` or `<project>.archived-*`) and
        //     resolveFinalizeAuthority refuses when more than one matches, so a sibling folder would
        //     make the NEXT resume ambiguous. A nested directory is at depth 2 and no name scan sees it.
        //   * ONLY when that authority sits under MAIN — then the orphan inherits the archive
        //     directory's own downstream classification exactly (the sink's untracked-own-archive
        //     exemption is keyed on the `kaola-workflow/archive/<project>/` prefix). An authority in the
        //     LINKED worktree is a tree removeWorktree may force-remove minutes later, so moving into it
        //     would be a new destruction route wearing a rescue's name: leave main's folder alone.
        // A failed move leaves the folder in place and reports the fault. Nothing here refuses.
        try {
          const mainRoot4 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
          const linkedRoot4 = fs.realpathSync(root);
          if (mainRoot4 && mainRoot4 !== linkedRoot4) {
            const mainLive = path.join(mainRoot4, 'kaola-workflow', args.project);
            if (fs.existsSync(mainLive)) {
              let authorityInMain = false;
              try {
                const realDest = fs.realpathSync(destDir);
                authorityInMain = realDest === mainRoot4 || realDest.startsWith(mainRoot4 + path.sep);
              } catch (_) { authorityInMain = false; }
              if (!authorityInMain) {
                result.main_live_orphan = 'skipped_authority_outside_main';
              } else {
                const orphanDir = path.join(destDir,
                  '.orphan-main-live-' + new Date().toISOString().replace(/[:.]/g, '-'));
                try {
                  fs.renameSync(mainLive, orphanDir);
                  result.main_live_cleaned_on_resume = true;
                  result.main_live_orphan = 'moved';
                  result.main_live_orphaned_to = orphanDir;
                } catch (e) {
                  result.main_live_orphan = 'failed';
                  result.main_live_orphan_error = String((e && e.message) || e).slice(0, 300);
                }
              }
            }
          }
        } catch (_) {}
        // #395.2: non-convergent-recovery fix — when the archive is terminal-closed (not keep-open)
        // and a member's roadmap source is still live, run the SAME reconcile helper so re-run converges.
        if (!keepIssueOpen) {
          const rawNums = (field(raw, 'issue_numbers') || '').trim();
          let members = rawNums
            ? rawNums.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
            : [];
          const primaryN = parseInt(field(raw, 'issue_number'), 10);
          if (members.length === 0 && Number.isFinite(primaryN) && primaryN > 0) members = [primaryN];
          const sourceLive = members.some(n => fs.existsSync(path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md')));
          if (sourceLive) {
            let mainRoot3, linkedRoot3;
            try {
              mainRoot3 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
              linkedRoot3 = fs.realpathSync(root);
            } catch (_) { mainRoot3 = null; }
            const rec = reconcileRoadmapForClosure(root, members, Number.isFinite(primaryN) ? primaryN : (members[0] || null), { keepRoadmapSource: false }, mainRoot3, linkedRoot3);
            result.roadmap_source_removed = rec.roadmap_source_removed;
            result.roadmap_regenerated = rec.roadmap_regenerated;
            result.roadmap_sources_removed = rec.roadmap_sources_removed;
            result.roadmap_reconciled_on_resume = true;
            // #428: surface dual-root removal map + residue from the resume reconcile path.
            if (rec.roadmap_removed_by_root) result.roadmap_removed_by_root = rec.roadmap_removed_by_root;
            if (rec.roadmap_residue) result.roadmap_residue = rec.roadmap_residue;
            // #916: this backstop calls the SAME helper, so main's mirror can fail here too — and a
            // convergence path that repairs the roadmap silently is the defect it exists to fix.
            if (rec.roadmap_regenerated_by_root) result.roadmap_regenerated_by_root = rec.roadmap_regenerated_by_root;
            if (rec.roadmap_regenerated_main_error) result.roadmap_regenerated_main_error = rec.roadmap_regenerated_main_error;
          }
        }
      }
    } catch (_) { archiveStateStamped = 'failed'; }
  }
  let worktreeRemoved = 'failed';
  if (!args.keepWorktree) {
    try {
      // #426: run git-worktree-remove from mainRoot (not inside the worktree being removed).
      const wtResult = removeWorktree(cmdFinalizeIsLinkedRun ? cmdFinalizeMainRoot : root, args.project, folder);
      if (wtResult && wtResult.removed === true) worktreeRemoved = 'removed';
      else if (wtResult && wtResult.removed === false && wtResult.reason === 'missing') worktreeRemoved = 'missing';
      else if (wtResult && wtResult.removed === false) worktreeRemoved = 'failed';
    } catch (_) { worktreeRemoved = 'failed'; }
  } else {
    // #333: the keep-worktree commit block is MOVED to the END of cmdFinalize (commit-last) so
    // the ## Closure append + backstop writes land INSIDE the `chore: archive` commit.
    worktreeRemoved = 'kept';
  }
  let issueNumber = folder && folder.issue_iid;
  // #328: read bundle member array — from folder (live) or archive dest (null-folder fallback)
  let issueNumbers = (folder && Array.isArray(folder.issue_numbers) && folder.issue_numbers.length)
    ? folder.issue_numbers : [];
  // null-folder fallback: archiveProjectDir ran first, so dest is the archive path
  if ((issueNumber == null || issueNumbers.length === 0) && result.dest) {
    try {
      const statePath = path.join(result.dest, 'workflow-state.md');
      if (fs.existsSync(statePath)) {
        const stateContent = fs.readFileSync(statePath, 'utf8');
        if (issueNumber == null) {
          const n = parseInt(field(stateContent, 'issue_number'), 10);
          issueNumber = Number.isFinite(n) ? n : null;
        }
        if (issueNumbers.length === 0) {
          const rawNums = (field(stateContent, 'issue_numbers') || '').trim();
          if (rawNums) {
            issueNumbers = rawNums.split(',')
              .map(s => parseInt(s.trim(), 10))
              .filter(n => Number.isFinite(n) && n > 0);
          }
        }
      }
    } catch (_) {}
  }
  // #328: clearAdvisoryClaim per bundle member; primary's status feeds claim_label_removed
  // for the existing checkClosureInvariants in-progress-label-removed check.
  // Single-issue path: issueNumbers is empty; falls through to scalar call below (unchanged).
  let claimLabelRemoved;
  if (issueNumbers.length > 0) {
    // Bundle: clear label for each member; primary's status is the canonical one.
    for (const n of issueNumbers) {
      const labelStatus = clearAdvisoryClaim(n, 'finalized', { full_name: folder ? folder.full_name : projectInfo.full_name, html_url: folder ? folder.project_html_url : projectInfo.html_url }, args.project);
      if (n === issueNumber) claimLabelRemoved = labelStatus;
    }
    if (claimLabelRemoved == null) claimLabelRemoved = 'failed';
  } else {
    // Single-issue path (unchanged)
    claimLabelRemoved = clearAdvisoryClaim(issueNumber, 'finalized', projectInfo, args.project);
  }
  // #328: per-member remote close probe (warning-first: catch per member, accumulate, never abort)
  let remoteIssueClosed = 'skipped_offline';
  const closedIssues = [];       // members probed as closed
  const failedIssueClosures = []; // members whose probe threw/returned unavailable
  const openIssues = [];          // #369: members probed STILL OPEN while online (never silent-neither)
  const keepOpenWarnings = [];   // #336: probe-truth warnings under keep-open
  // #336: under keep-open the disposition is a DECISION, not an observation — record the
  // `kept_open` decision token (even under OFFLINE; the decision is local and known, and the
  // invariant checker keys on it). Truth still wins: when online and the issue is ALREADY
  // closed on the forge, record 'already_closed' + a warning so the receipt never falsely
  // claims a closed issue was deliberately kept open.
  if (keepIssueOpen) {
    remoteIssueClosed = 'kept_open';
    if (!OFFLINE) {
      const probeNums = issueNumbers.length > 0 ? issueNumbers : (issueNumber ? [issueNumber] : []);
      for (const n of probeNums) {
        try {
          const probe = probeIssueState(n);
          if (probe.state === 'closed') {
            closedIssues.push(n);
            keepOpenWarnings.push('keep-open requested but the remote issue is already closed (issue #' + n + ')');
          }
        } catch (_) {}
      }
      if (closedIssues.length > 0 && (issueNumbers.length === 0 || closedIssues.length === issueNumbers.length)) {
        remoteIssueClosed = 'already_closed';
      }
    }
  } else if (!OFFLINE && issueNumbers.length > 0) {
    // Bundle: probe each member. #369: every member lands in EXACTLY one bucket (no silent-neither) —
    // closed -> closed_issues; unavailable -> failed_issue_closures; still-open-while-online -> open_issues.
    for (const n of issueNumbers) {
      const probe = probeIssueState(n);
      if (probe.state === 'closed') {
        closedIssues.push(n);
      } else if (probe.state === 'unavailable') {
        failedIssueClosures.push(n);
      } else {
        openIssues.push(n); // 'open' while online — recorded, never silently dropped
      }
    }
    // #369: truthful ONLINE token — all closed -> already_closed; any member open/failed -> partial
    // (never `skipped_offline`, the OFFLINE-only token).
    // #508: add close_pending arm for the all-open merge-lane case. When none are closed
    // (closedIssues=[]), reporting 'partial' produces a token-vs-list disagreement: the token
    // claims "some closed" while the list is empty. Mirror the single-issue semantics: when no
    // members are closed yet the close is PENDING (deferred to sink-merge on the merge lane).
    // The 'partial' arm still covers the genuinely mixed case (some already-closed on the forge).
    remoteIssueClosed = (closedIssues.length === issueNumbers.length) ? 'already_closed'
      : (closedIssues.length === 0 ? 'close_pending' : 'partial');
  } else if (!OFFLINE && issueNumber) {
    // #396.2: single-issue ONLINE path — already closed → 'already_closed'; otherwise the close is
    // PENDING (the merge sink closes it) → 'close_pending' (was 'skipped_offline' while online).
    try {
      const probe = probeIssueState(issueNumber);
      remoteIssueClosed = (probe.state === 'closed') ? 'already_closed' : 'close_pending';
    } catch (_) { remoteIssueClosed = 'skipped_offline'; }
  }
  // #427: execute forge issue close for each open member. Probe-before-close: members already
  // closed or probed-unavailable are handled without a double-close attempt.
  // ONLY when online, ONLY when not keep-open, ONLY for finalize-only flows (not a merge-lane
  // run — #617 derives that from durable state via mergeLaneDeferred, not just the caller
  // remembering --keep-worktree — where sink-merge is responsible for closing after the merge
  // is verified). Runs AFTER archive+verify+delete.
  if (!keepIssueOpen && !OFFLINE && !mergeLaneDeferred) {
    const forgeOpts = cmdFinalizeIsLinkedRun ? { cwd: cmdFinalizeMainRoot } : undefined;
    if (issueNumbers.length > 0) {
      // Bundle: close each member that is still open (i.e. in openIssues bucket)
      for (let i = openIssues.length - 1; i >= 0; i--) {
        const n = openIssues[i];
        const token = closeIssueIdempotent(n, forgeOpts);
        if (token === 'closed' || token === 'already_closed') {
          closedIssues.push(n);
          openIssues.splice(i, 1);
        } else {
          failedIssueClosures.push(n);
          openIssues.splice(i, 1);
        }
      }
      // Recompute the token based on updated buckets
      remoteIssueClosed = (closedIssues.length > 0 && closedIssues.length === (issueNumbers.length - failedIssueClosures.length))
        ? (failedIssueClosures.length === 0 ? 'closed' : 'partial')
        : (failedIssueClosures.length > 0 ? 'partial' : 'closed');
      if (closedIssues.length === issueNumbers.length) remoteIssueClosed = 'closed';
      if (closedIssues.length === 0 && failedIssueClosures.length > 0) remoteIssueClosed = 'failed';
    } else if (issueNumber) {
      // Single-issue: close if still open (remoteIssueClosed !== 'already_closed')
      if (remoteIssueClosed !== 'already_closed') {
        const token = closeIssueIdempotent(issueNumber, forgeOpts);
        remoteIssueClosed = token; // 'closed', 'already_closed', or 'failed'
      }
    }
  }
  // #396.4 (D2): merge-lane finalize runs BEFORE the sink closes members → record close_disposition.
  // #416: use computeClosePendingFinalize() which correctly excludes 'skipped_offline' (a probe
  // outage while ONLINE must not masquerade as close_pending).
  const closePendingFinalize = computeClosePendingFinalize(keepIssueOpen, OFFLINE, remoteIssueClosed);
  const probeDegraded = isProbeDegraded(OFFLINE, remoteIssueClosed);
  const closureReceipt = buildClosureReceipt(args.project, issueNumber, {
    archive: result.skipped ? 'skipped' : (result.archived ? 'closed' : 'failed'),
    roadmap_source_removed: result.roadmap_source_removed,
    roadmap_regenerated: result.roadmap_regenerated,
    remote_issue_closed: remoteIssueClosed,
    claim_label_removed: claimLabelRemoved,
    worktree_removed: worktreeRemoved,
    branch_removed: 'kept',
    // #396.3: record keep-open INTENT (checker keys on it, not the mutable token).
    keep_open_requested: !!keepIssueOpen,
    // #396.4 (D2): suppress the premature remote-members-closed alarm on the merge lane.
    close_disposition: closePendingFinalize ? 'close_pending' : undefined
  });
  // #416: attach probe_degraded AFTER buildClosureReceipt (the builder filters by
  // CLOSURE_RECEIPT_FIELDS; probe_degraded is not in the schema yet, so attach post-build).
  if (probeDegraded) closureReceipt.probe_degraded = true;
  // #426: attach anchored_root post-build (added to CLOSURE_RECEIPT_FIELDS in n3; kept here
  // so the receipt carries the durable main-root path independent of schema update).
  if (closureReceipt) closureReceipt.anchored_root = cmdFinalizeIsLinkedRun ? cmdFinalizeMainRoot : root;
  // #428: dual-root roadmap receipt
  if (result.roadmap_removed_by_root) closureReceipt.roadmap_removed = result.roadmap_removed_by_root;
  if (result.roadmap_residue && result.roadmap_residue.length > 0) closureReceipt.roadmap_residue = result.roadmap_residue;
  // #916: the per-root mirror REBUILD outcome. roadmap_regenerated stays the linked root's scalar —
  // repurposing it would change what the 'failed' warning means — so this is where a reader of the
  // receipt learns which of the two mirrors is stale.
  if (result.roadmap_regenerated_by_root) closureReceipt.roadmap_regenerated_by_root = result.roadmap_regenerated_by_root;
  if (result.roadmap_regenerated_main_error) closureReceipt.roadmap_regenerated_main_error = result.roadmap_regenerated_main_error;
  // The durable half. Recorded, never gated: finalize still exits 0 and still archives — the
  // orchestrator decides whether to rebuild main's mirror by hand. Without this the finding lives
  // only on this process's stdout, and the successor who opens the archived run folder instead
  // reads a closure that mentions the roadmap nowhere at all.
  if (result.roadmap_regenerated_by_root && result.roadmap_regenerated_by_root.main === 'failed') {
    recordFinalizeFinding('main_roadmap_mirror_not_regenerated',
      'The MAIN repo root\'s kaola-workflow/ROADMAP.md was NOT regenerated, so main\'s roadmap '
        + 'mirror is stale and can still list an issue this run closed. The linked worktree\'s own '
        + 'mirror rebuilt fine, which is the outcome `roadmap_regenerated: regenerated` reports — '
        + 'the two roots are reported separately in `roadmap_regenerated_by_root`.',
      ['main root: ' + (cmdFinalizeIsLinkedRun ? cmdFinalizeMainRoot : root)]
        .concat(result.roadmap_regenerated_main_error
          ? ['', 'regenerateRoadmap said:', '', '```', result.roadmap_regenerated_main_error, '```']
          : [])
        .concat(['', 'Clear the cause above, then rebuild it by hand: '
          + '`node scripts/kaola-gitea-workflow-roadmap.js generate` from the main root.']));
  }
  // #427: structured closure roll-up (post-build — not a flat schema field; Decision-5 trap).
  {
    const issueSet = issueNumbers.length > 0 ? issueNumbers : (issueNumber ? [issueNumber] : []);
    closureReceipt.closure = {
      attempted:       issueSet,
      closed:          closedIssues.slice(),
      failed:          failedIssueClosures.slice(),
      skipped_offline: OFFLINE ? issueSet : [],
      kept_open:       keepIssueOpen ? issueSet : [],
    };
  }
  // #328: attach bundle receipt fields AFTER buildClosureReceipt (the builder filters by
  // CLOSURE_RECEIPT_FIELDS which does not include these new bundle keys — Decision-5 trap).
  // Only attach when this is a bundle project (issueNumbers present).
  if (issueNumbers.length > 0) {
    closureReceipt.issue_numbers = issueNumbers;
    closureReceipt.closed_issues = closedIssues;
    closureReceipt.failed_issue_closures = failedIssueClosures;
    closureReceipt.open_issues = openIssues; // #369: members still open while online (visible, never silent)
    closureReceipt.roadmap_sources_removed = result.roadmap_sources_removed || [];
  }
  // #403.7: record the #297 MAIN staged-ADD orphan unstage (was silent).
  if (Array.isArray(result.roadmap_staged_reconciled) && result.roadmap_staged_reconciled.length > 0) {
    closureReceipt.roadmap_staged_reconciled = result.roadmap_staged_reconciled;
  }
  // #395.2: surface a resume-time roadmap convergence.
  if (result.roadmap_reconciled_on_resume) {
    closureReceipt.roadmap_reconciled_on_resume = true;
  }
  // #336: surface keep-open probe-truth warnings (issue already closed on the forge).
  if (keepOpenWarnings.length > 0) {
    closureReceipt.warnings = (closureReceipt.warnings || []).concat(keepOpenWarnings);
  }
  // archiveProjectDir runs first and renames the live folder to result.dest, so the live cache is
  // gone by now; every .cache probe below checks the archive candidate first, then live as fallback.
  const liveCacheDir = path.join(root, 'kaola-workflow', args.project, '.cache');
  const archiveCacheDir = result.dest ? path.join(result.dest, '.cache') : null;
  // n5 (#653 finding D3): advisory selection-evidence probe, using the archive-then-live candidate
  // order (archiveProjectDir already ran).
  closureReceipt.selection_evidence = probeSelectionEvidence([archiveCacheDir, liveCacheDir]);
  // Advisory goal DECLARATION (presence, never satisfaction — see computeGoalDeclaration). Probe
  // archive-dest first (the plan was already renamed there), then the live location as a fallback
  // for a crash-resume where the archive did not complete.
  const goalDeclaration = computeGoalDeclaration([
    result.dest,
    path.join(root, 'kaola-workflow', args.project)
  ]);
  closureReceipt.goal_declared = goalDeclaration.declared;
  closureReceipt.goal_declared_source = goalDeclaration.source;
  closureReceipt.goal_declared_probed = goalDeclaration.probed;
  const invariantResult = checkClosureInvariants(root, closureReceipt, result.dest);
  // #333: disposition is DECISION-derived on cmdFinalize (the orchestrator closes the issue after
  // sink-merge, so the default merge lane is honestly close-pending, never a false `closed`).
  const issueDisposition = keepIssueOpen ? 'kept-open'
    : (remoteIssueClosed === 'already_closed' ? 'closed' : 'close-pending');
  // #333: append the compact terminal receipt to the archived state (facts only known after the
  // rename: claim/worktree disposition + issue disposition). Presence-guarded / idempotent.
  if (result.dest) {
    appendClosureBlock(result.dest, {
      issueDisposition: issueDisposition,
      claimLabelRemoved: claimLabelRemoved,
      worktreeRemoved: worktreeRemoved,
      closureInvariants: invariantResult.ok ? 'ok' : ('violations:' + invariantResult.violations.length)
    });
  }
  // #333: keep-worktree commit block MOVED here (commit-last) — after the ## Closure append so the
  // archive + roadmap removal + ## Closure all land in ONE `chore: archive` commit (the tree is then
  // clean, which the #217 second-finalize no-new-commit + #296 B1 re-entry asserts depend on).
  if (args.keepWorktree) {
    let mainRoot2, linkedRoot2;
    try {
      mainRoot2 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
      linkedRoot2 = fs.realpathSync(root);
    } catch (_) { mainRoot2 = null; }
    if (mainRoot2 && mainRoot2 !== linkedRoot2) {
      // #356: stage, then commit ONLY on an explicit staged-changes exit code.
      // #907: isolated as before — a staging failure still never cascades into a commit — but no
      // longer SILENT. Discarding it left `archive_commit` reporting a disposition while nothing had
      // been staged for it, and the archived record read exactly as clean as a run that staged
      // everything. stderr is piped so git's own line becomes the finding's detail, then re-emitted.
      // #922: SCOPED to this project's own paths. This was one unscoped `git add -A kaola-workflow/`,
      // which swept whatever else happened to be dirty under that directory — another project's live
      // run folder, another project's archive band — into `chore: archive <project>` at exit 0. A
      // commit spanning two run folders makes neither one's diff attributable, and concurrent runs on
      // one checkout are a supported posture. Not a failure mode: it SUCCEEDED, which is why no finding
      // type reached it and why the remedy is the pathspec rather than a new type.
      // The `git rm -r --cached` is what forces the live run folder OUT of the branch. It is not
      // optional alongside the scoping: the unscoped `-A` used to re-add that folder from disk, so
      // narrowing the add on its own would have left it on the branch that `chore: archive` exists to
      // remove it from. Both calls share one try/catch, so the one-finding shape is unchanged.
      const archivePaths = ['kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md'];
      if (result.dest) {
        const destRel = path.relative(root, result.dest);
        if (destRel && !destRel.startsWith('..') && !path.isAbsolute(destRel)) archivePaths.unshift(destRel);
      } else if (result.skipped === 'source-missing') {
        archivePaths.unshift(path.join('kaola-workflow', 'archive', args.project));
      }
      const existingArchivePaths = archivePaths.filter(p => fs.existsSync(path.join(root, p)));
      let archiveAddOk = true;
      try {
        execFileSync('git', ['-C', root, 'rm', '-r', '--cached', '--ignore-unmatch', '--',
          'kaola-workflow/' + args.project], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] });
        if (existingArchivePaths.length > 0) {
          execFileSync('git', ['-C', root, 'add', '-A', '--', ...existingArchivePaths],
            { encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] });
        }
        finalizeTx.archive_stage = 'staged';
      } catch (e) {
        const detail = gitFaultDetail(e);
        archiveAddOk = false;
        finalizeTx.archive_stage = 'failed';
        finalizeTx.archive_stage_detail = detail;
        process.stderr.write('kaola-workflow-claim finalize: WARNING: staging the archive bookkeeping '
          + 'FAILED for ' + args.project + ' — the `chore: archive` commit below did not carry it.\n'
          + (detail ? detail + '\n' : ''));
        recordFinalizeFinding('archive_stage_failed',
          'The archive bookkeeping could not be staged: staging this project\'s own archive paths '
            + 'failed, so the `chore: archive` commit did not carry the archive, the roadmap, or the '
            + 'removal of the live run folder from the branch.',
          detail ? ['git said:', '', '```', detail, '```'] : []);
      }
      // #907: derived from the OUTCOME, not from what happens to exist on disk. It used to read
      // `true` whenever the two roadmap paths existed — including when the `git add` above exited
      // non-zero and staged nothing at all, which is a false statement about the index in exactly the
      // run where it matters most.
      finalizeTx.roadmap_staged = archiveAddOk
        && (fs.existsSync(path.join(root, 'kaola-workflow', '.roadmap'))
          || fs.existsSync(path.join(root, 'kaola-workflow', 'ROADMAP.md')));
      // #832: the ARCHIVE's fate is decided here, independently of whatever else the commit below
      // carries. The old code read `git diff --cached --quiet` with NO pathspec, so the roadmap
      // staging alone made hasStaged true and the transaction recorded archive_commit:'committed'
      // even when git had refused the archive outright ("The following paths are ignored by one of
      // your .gitignore files"). A refused operation must never be reported as a success.
      const archiveDisposition = classifyArchiveDisposition(mainRoot2, result.dest);
      if (archiveDisposition === 'skipped_gitignored') {
        process.stderr.write('kaola-gitea-workflow-claim finalize: WARNING: kaola-workflow/archive is covered by this '
          + 'repository\'s .gitignore — the archive for ' + args.project + ' was written to '
          + result.dest + ' but git REFUSES to track it. It is on disk only; nothing was committed.\n');
      } else if (archiveDisposition === 'deferred_to_sink') {
        // #901: the archive band is committable but a rule may still cover files INSIDE it. The
        // deferral is honest — the sink force-adds these under this project's archive path and then
        // verifies each became a blob — but the run record must name what the deferral rests on. This
        // silence is what let a finalize look clean while the run's .cache evidence sat on a path git
        // refuses to stage; recorded on the transaction, not only on stderr, so it outlives the run.
        const ignoredEvidence = ignoredArchiveEvidence(mainRoot2, result.dest);
        if (ignoredEvidence.length > 0) {
          finalizeTx.archive_ignored_evidence = ignoredEvidence;
          process.stderr.write('kaola-gitea-workflow-claim finalize: NOTE: ' + ignoredEvidence.length + ' run-evidence '
            + 'file(s) under ' + result.dest + ' are covered by this repository\'s .gitignore while the archive '
            + 'directory itself is not — the sink\'s archive_commit step force-adds them and verifies each one '
            + 'became a blob: ' + ignoredEvidence.join(', ') + '\n');
        }
      }
      // #907: exit 0 and exit 1 are both ANSWERS; anything else is the probe failing, and reading a
      // failed probe as "nothing staged" is how a broken index became `nothing_to_commit` at exit 0.
      // It still does not commit — an unreadable index is no basis for one — but it says so now.
      let hasStaged = false;
      try { execFileSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' }); }
      catch (e) {
        if (e && e.status === 1) hasStaged = true;
        else {
          const detail = gitFaultDetail(e);
          finalizeTx.archive_commit_probe = 'failed';
          finalizeTx.archive_commit_probe_detail = detail;
          process.stderr.write('kaola-workflow-claim finalize: WARNING: could not read the index for '
            + args.project + ' — `git diff --cached --quiet` did not answer, so no `chore: archive` '
            + 'commit was attempted.\n' + (detail ? detail + '\n' : ''));
          recordFinalizeFinding('archive_commit_probe_failed',
            'The staged-changes probe for `chore: archive` failed, so the transaction could not tell '
              + 'whether anything was staged and did not commit. This is NOT the same fact as '
              + '"nothing to commit".',
            detail ? ['git said:', '', '```', detail, '```'] : []);
        }
      }
      if (hasStaged) {
        const committed = commitFinalizeStep(root, 'chore: archive ' + args.project);
        if (!committed.ok) {
          finalizeTx.archive_commit = 'failed';
          flushFinalizeFindings();
          emitFinalizeCommitFailure(args.project, 'archive', committed, finalizeTx);
          return;
        }
      }
      finalizeTx.archive_commit = archiveDisposition || (hasStaged ? 'committed' : 'nothing_to_commit');
      // #816 Step 8 — the commit gate. The sink receives only committed work, so whatever the
      // mirror + Finalization left in the worktree lands in ONE `chore: finalize <project>` commit.
      // The staged set is SCOPED, never a blind `-A`: this project's own bookkeeping plus the
      // Finalization residue outside kaola-workflow/. A foreign project's paths are never staged
      // by the transaction, and the single-project guard re-runs against the whole index so an
      // operator's pre-staged foreign content still refuses instead of riding along.
      const residue = [];
      let residueProbe = 'ok';
      try {
        const status = execFileSync('git', ['-C', root, 'status', '--porcelain'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER });
        for (const rel of parsePorcelainPaths(status)) {
          // sink-receipt.json / sink-fallback.json are transaction JOURNALS owned by the sink
          // script — never part of the deliverable, never committed.
          if (SINK_JOURNAL_RE.test(rel)) continue;
          if (!rel.startsWith('kaola-workflow/')) { residue.push(rel); continue; }
          const seg = rel.split('/');
          if (seg[1] === '.roadmap' || seg[1] === 'ROADMAP.md') { residue.push(rel); continue; }
          if (seg[1] === 'archive') {
            const band = seg[2] || '';
            if (band === args.project || band.indexOf(args.project + '.archived-') === 0) residue.push(rel);
            continue;
          }
          if (seg[1] === args.project) residue.push(rel);
        }
        residueProbe = 'ok';
      } catch (e) {
        // #907: THE PROBE THAT FEEDS THE CONVERTED CALL. Converting the `git add` below while leaving
        // this swallow in place fixed nothing when the fault was here: an unreadable index makes this
        // throw, the residue list comes back EMPTY, the `git add` never runs, and the transaction
        // reports `residue_stage: "skipped"` — documented as "no residue to stage", which is a false
        // statement about a probe that failed — followed by `finalize_commit: "nothing_to_commit"` at
        // exit 0 with `closure_invariants.ok: true`. Measured with a corrupted worktree index: the
        // deliverable stayed uncommitted and the archived record read completely clean.
        const detail = gitFaultDetail(e);
        residueProbe = 'failed';
        finalizeTx.residue_stage = 'unprobeable';
        finalizeTx.residue_probe_detail = detail;
        process.stderr.write('kaola-workflow-claim finalize: WARNING: could not read the working tree '
          + 'status for ' + args.project + ' — the finalization residue could not be enumerated, so '
          + 'NOTHING was staged for the `chore: finalize` commit and uncommitted work may remain in '
          + 'the worktree.\n' + (detail ? detail + '\n' : ''));
        recordFinalizeFinding('residue_probe_failed',
          'The finalization residue could not be enumerated: `git status --porcelain` failed, so the '
            + 'transaction staged nothing for `chore: finalize`. What the run left uncommitted is '
            + 'therefore UNKNOWN and this record cannot name it — the probe that would have named it '
            + 'is the one that failed. Re-read the worktree by hand before trusting this closure.',
          detail ? ['git said:', '', '```', detail, '```'] : []);
      }
      // #907: the staging failure is REPORTED, not swallowed and not refused. One UNMATCHED pathspec
      // exits 128 and stages NOTHING, not even the healthy files beside it. #920: that is this one
      // case, not a property of `git add` — a GITIGNORED path beside an addable one exits 1 having
      // staged the addable one, so what reached the index is read from the index (pathsNotStaged),
      // never inferred from the exit. Measured end-to-end on the documented `--keep-worktree`
      // linked finishing sequence, with one untracked `notes.md ` (a single trailing space) beside a
      // good file: git exited 128, the bare `catch (_) {}` that used to sit here dropped it, the
      // staged-changes probe below then answered "nothing staged", and finalize emitted
      // `finalize_commit: "nothing_to_commit"` at exit 0 with `status: "closed"` and
      // `closure_invariants.ok: true` — the deliverable uncommitted, and a re-run byte-identical, so
      // it never converged and nothing anywhere said why. A mangled pathspec was one cause of that
      // and is fixed upstream in the parser; disk-full, a permission fault and a held index lock all
      // reach this same catch, which is why the fix here is the report and not the parse.
      // Exit stays 0, the finding is typed on the envelope, and it is written durably below.
      if (residue.length > 0) {
        try {
          // stderr PIPED, not inherited: git's own `fatal: …` line is the whole diagnosis and it has
          // to ride along in the typed finding. Re-emitted on this process's stderr immediately
          // afterwards so a terminal reader loses nothing the inherited form used to show.
          execFileSync('git', ['-C', root, 'add', '-A', '--', ...residue],
            { encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] });
          finalizeTx.residue_stage = 'staged';
        } catch (e) {
          const detail = String((e && (e.stderr || e.message)) || e).trim().slice(0, 1000);
          finalizeTx.residue_stage = 'failed';
          finalizeTx.residue_stage_detail = detail;
          const residueNotStaged = pathsNotStaged(root, residue);
          if (residueNotStaged) finalizeTx.residue_unstaged = residueNotStaged.slice(0, 50);
          process.stderr.write('kaola-workflow-claim finalize: WARNING: staging the finalization residue '
            + 'FAILED for ' + args.project + ' — `git add` exited non-zero over ' + residue.length
            + ' path(s)' + (residueNotStaged
              ? (residueNotStaged.length
                ? '; these did not reach the index: ' + residueNotStaged.join(', ')
                : '; every one of them reached the index anyway')
              : '; which of them reached the index could not be read') + '\n'
            + (detail ? detail + '\n' : ''));
          // The durable half goes through the shared accumulator, flushed once below. Writing the
          // section here directly was correct only while this was the ONLY fault that could reach it —
          // appendSummarySection is idempotent by heading, so a second fault in the same run would
          // have been silently dropped.
          recordFinalizeFinding('residue_stage_failed',
            'The `chore: finalize` commit could not stage the finalization residue: `git add` exited '
              + 'non-zero, and the transaction recorded `finalize_commit: nothing_to_commit` — the run '
              + 'reports closed while work may still be uncommitted in the worktree.',
            (residueNotStaged
              ? (residueNotStaged.length
                ? ['Paths not staged:', ''].concat(residueNotStaged.map(p => '- ' + p))
                : ['Every path this call was given did reach the index despite the non-zero exit.'])
              : ['Which paths reached the index could not be read, so this record does not say. '
                + 'Read the index before repairing anything.'])
              .concat(detail ? ['', 'git said:', '', '```', detail, '```'] : []));
        }
      }
      const finalGuard = checkFinalizeStagingGuard(root, args.project);
      if (!finalGuard.ok) {
        flushFinalizeFindings();
        output({
          result: 'refuse',
          reason: finalGuard.reason,
          project: args.project,
          staged: finalGuard.detail,
          finalize_transaction: finalizeTx,
          operator_hint: 'Split the commit: the index carries workflow state that does not belong '
            + 'to this project. Unstage it, then re-run finalize — the archive is already recorded, '
            + 'so the re-run resumes at the commit step.',
          errors: [finalGuard.reason]
        }, 1);
        return;
      }
      // #907: same three-way read as the archive probe above — 0 and 1 are answers, anything else is
      // the probe failing and must not be read as "nothing to commit".
      let hasFinalStaged = false;
      try { execFileSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' }); }
      catch (e) {
        if (e && e.status === 1) hasFinalStaged = true;
        else {
          const detail = gitFaultDetail(e);
          finalizeTx.finalize_commit_probe = 'failed';
          finalizeTx.finalize_commit_probe_detail = detail;
          process.stderr.write('kaola-workflow-claim finalize: WARNING: could not read the index for '
            + args.project + ' — `git diff --cached --quiet` did not answer, so no `chore: finalize` '
            + 'commit was attempted and the run may be leaving work uncommitted.\n'
            + (detail ? detail + '\n' : ''));
          recordFinalizeFinding('finalize_commit_probe_failed',
            'The staged-changes probe for `chore: finalize` failed, so the transaction could not tell '
              + 'whether anything was staged and did not commit. This is NOT the same fact as '
              + '"nothing to commit".',
            detail ? ['git said:', '', '```', detail, '```'] : []);
        }
      }
      if (hasFinalStaged) {
        const committed = commitFinalizeStep(root, 'chore: finalize ' + args.project);
        if (!committed.ok) {
          finalizeTx.finalize_commit = 'failed';
          flushFinalizeFindings();
          emitFinalizeCommitFailure(args.project, 'finalize', committed, finalizeTx);
          return;
        }
        finalizeTx.finalize_commit = 'committed';
      } else if (residueProbe === 'failed' || finalizeTx.finalize_commit_probe === 'failed') {
        // #907: `nothing_to_commit` is a claim about the WORKING TREE, and neither of those faults
        // supports it — one could not enumerate what to stage, the other could not read what was
        // staged. `unknown` is the honest token; the finding beside it says which fault produced it.
        finalizeTx.finalize_commit = 'unknown';
      } else {
        // Nothing left to commit — the branch already carries the final candidate commit.
        finalizeTx.finalize_commit = 'nothing_to_commit';
      }
      flushFinalizeFindings();
    }
  }
  // #395.5 (D1): OPT-IN exit gate — --strict makes the exit code reflect ok:false (exit 4); default 0.
  const strictFailCode = (args.strict && invariantResult && invariantResult.ok === false) ? 4 : undefined;
  // #916: every other flush site sits inside the `--keep-worktree` commit block, so a finding made
  // on any other lane reached the emit and never the archive. Idempotent — a lane that already
  // flushed no-ops here — and it must run BEFORE the emit below, which carries finalizeTx.findings.
  flushFinalizeFindings();
  // `validation` and `changed_paths` are MEASUREMENTS on the envelope, never verdicts: what this
  // repo's own chains said about this tree, and what this branch touched outside the run-state and
  // documentation bands. Nothing compares either to anything, and neither can fail the finalize.
  // Both are durable in the archived finalization-summary.md under `## Validation` /
  // `## Changed Paths` — the envelope copies are for whoever is reading the run right now.
  const finalizeEmit = Object.assign({ status: 'closed' }, result, {
    claim_label_removed: claimLabelRemoved,
    archive_state_stamped: archiveStateStamped,
    issue_disposition: issueDisposition,
    validation: finalizeValidation,
    changed_paths: finalizeChangedPaths,
    closure_receipt: closureReceipt,
    closure_invariants: invariantResult,
    finalize_transaction: finalizeTx
  });
  if (finalizeChangedProbe !== 'measured') finalizeEmit.changed_paths_probe = finalizeChangedProbe;
  output(finalizeEmit, strictFailCode);
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
  // Read base_branch BEFORE archiveProjectDir moves the state file.
  let savedBaseBranch = '';
  try { savedBaseBranch = field(fs.readFileSync(folder.state_file, 'utf8'), 'base_branch'); } catch (_) {}

  const result = archiveProjectDirSafely(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
  if (!closureContract.archiveSucceeded(result)) {
    // #906: BOTH halves. This route reported `missing` alone, which was survivable while every
    // refusal it could produce was a dropped FILE — and stopped being survivable the moment an entry
    // the walk cannot compare (a symlink) could also refuse here: the operator got exit 1,
    // `archive_incomplete`, and an empty list. cmdFinalize has reported both halves since #676; this
    // route, watch-pr and the abandon sweep are the three that run NO Step-8a mirror, so they are
    // exactly where a main-only entry shows up. An unnamed loss is unrepairable.
    output({ released: false, result: 'refuse', project: folder.project,
      reason: result.reason || (result.archive_incomplete ? 'archive_incomplete' : 'archive_refused'),
      detail: result.detail, missing: result.missing, mismatched: result.mismatched,
      reasoning: 'archival did not return an explicit success result; worktree, branch, and claim-label cleanup was not attempted.'
        + (result.archive_incomplete === true ? ' ' + archiveIncompleteRemedy(root, folder.project) : '') }, 1);
    return;
  }
  try { removeWorktree(root, folder.project, folder); } catch (_) {}

  // In-place branch restore: if this project created a feature branch (NATIVE=0 path),
  // checkout base/default BEFORE deleting the feature branch (git refuses deleting current branch).
  const featureBranch = folder.branch;
  let restoreNote = '';
  const releaseBaseBranch = savedBaseBranch || defaultBranch(root);
  if (featureBranch && branchExists(root, featureBranch)) {
    try {
      const cur = inPlaceHead(root);
      // #715 F1: exempt ONLY the exact dest this release just created (the ACTUAL result.dest —
      // never a reconstructed plain path, the #700 collision-suffix lesson) from the dirty gate.
      // Without this the fresh archive deterministically vetoes its own restore (archive/* is
      // never-parked), stranding the archive commit on the discarded feature branch. Every OTHER
      // dirty path keeps blocking the restore exactly as today.
      const restoreExempt = [];
      if (result && result.dest) {
        const relDest = path.relative(root, result.dest).split(path.sep).join('/');
        if (relDest && !relDest.startsWith('..')) restoreExempt.push(relDest);
      }
      const dirty = treeDirty(root, [folder.project], restoreExempt);
      if (cur === featureBranch) {
        if (dirty) {
          restoreNote = 'tree dirty while on feature branch; skipped base restore + branch delete';
        } else if (releaseBaseBranch) {
          execFileSync('git', ['-C', root, 'checkout', releaseBaseBranch], { stdio: ['ignore', 'ignore', 'ignore'] });
          removeBranch(root, featureBranch);
        } else {
          restoreNote = 'no base_branch and no resolvable default; skipped branch delete';
        }
      } else {
        removeBranch(root, featureBranch);
      }
    } catch (_) { /* defensive: discard must not throw */ }
  }

  // #715: commit the discard archive so the next sink's preflight does not refuse it as foreign
  // dirt. Runs AFTER the in-place branch restore so the commit lands on the restored base branch
  // (committing before the checkout+delete would strand the archive commit on the deleted feature
  // branch). #715 F1: the helper re-verifies the current checkout IS the surviving base branch
  // before staging — when the restore was skipped (still dirty / no resolvable base) or the
  // checkout is any other non-base branch, the commit is SKIPPED, the archive stays on disk as
  // recoverable residue, and the outcome is reported truthfully with the branch disclosed.
  // #715 N5-A: the release KNOWS the branch it discards — pass it so the helper can refuse a
  // falsified base_branch naming the discarded branch (the release's restored base needs no
  // default-branch constraint: the restore itself established it as surviving).
  // Local git (OFFLINE must not skip it); never throws — a failure is reported loudly on
  // the emitted JSON instead of stranding the release (the live folder is already gone).
  const discardCommit = commitDiscardArchive(result, folder.project, releaseBaseBranch,
    { discardedBranch: featureBranch || null });

  // #396.1: capture the label-clear status (was discarded) — a FAILED remove prints released:true
  // exit 0 with no label field while the "claim cleared" comment lies; surface + warn.
  // #328: for a bundle project, clear advisory claim for every member; primary's status is canonical.
  const piRel = { full_name: folder.full_name, html_url: folder.project_html_url };
  let claimLabelRemoved;
  if (Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0) {
    for (const n of folder.issue_numbers) {
      const s = clearAdvisoryClaim(n, args.reason || 'discarded', piRel, folder.project);
      if (n === folder.issue_iid) claimLabelRemoved = s;
    }
    if (claimLabelRemoved == null) claimLabelRemoved = 'failed';
  } else {
    claimLabelRemoved = clearAdvisoryClaim(folder.issue_iid, args.reason || 'discarded', piRel, folder.project);
  }
  const releaseWarnings = [];
  if (claimLabelRemoved !== 'removed' && claimLabelRemoved !== 'skipped_offline') {
    releaseWarnings.push('claim label removal status: ' + claimLabelRemoved +
      ' — the workflow:in-progress label may still be on the issue; the next claim could hit user_target_blocked.');
  }
  // #735: an abandon that proceeded past a run-state-progress authority failure says so out
  // loud. The discard was still the right outcome (the user asked to abandon, and the archive
  // asserts no closure), but the archived folder is not a fully-verified lineage record.
  if (result.authority_downgraded) {
    releaseWarnings.push('run-state authority downgraded: ' + result.authority_downgraded +
      ' — the discard archive is a user-consented abandon, not a verified lineage record; it carries ' +
      'incomplete run-state progress artifacts (compliance/ledger/task-mirror).');
  }
  // #715: a failed discard-archive commit must not strand the release — surface it loudly.
  if (!discardCommit.committed) {
    releaseWarnings.push('discard archive commit failed: ' + discardCommit.detail +
      ' — the discard archive remains uncommitted at the main root; commit it manually or the next sink preflight will refuse it as foreign dirt.');
  }
  output(Object.assign(
    { released: true, project: folder.project, claim_label_removed: claimLabelRemoved },
    result,
    { discard_archive_committed: discardCommit.committed },
    // #715 F1: always disclose which branch received (or did not receive) the archive commit.
    { discard_archive_branch: discardCommit.branch },
    discardCommit.committed ? {} : { discard_archive_commit_detail: discardCommit.detail },
    restoreNote ? { restore_note: restoreNote } : {},
    releaseWarnings.length ? { warnings: releaseWarnings } : {}
  ));
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
  // #579: annotate each folder with its lane_bucket.
  const ctx = {
    ownSession: resolveSessionMarker(process.env),
    explicitResumeIssues: new Set(),
    coTenantSignal: process.env.KAOLA_COTENANT === '1',
    now: Date.now(),
    staleMs: adaptiveSchema.LANE_STALENESS_MS
  };
  const all = readActiveFolders(root, { excludeClosedIssues: false });
  const active = [];
  const drift = [];
  for (const folder of all) {
    const classified = classifyLane(folder, ctx);
    const annotated = Object.assign({}, folder, { lane_bucket: classified.bucket, lane_bucket_reason: classified.reasoning });
    if (folder.issue_iid != null && issueIsClosed(folder.issue_iid)) drift.push(annotated);
    else active.push(annotated);
  }
  output({ active, drift, count: active.length });
}

function cmdPatchBranch() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  assert(args.branch, '--branch required');
  assert(isSafeName(args.project), 'unsafe project name');
  // #398.1/#398.2: refuse an unsafe branch (flag-injection) or a newline-bearing value (durable-state
  // field injection) BEFORE rewriting the persisted ## Sink branch field.
  assertSafeBranchArg(args.branch, 'cmdPatchBranch');
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

function collectStale(root) {
  const activeFolders = readActiveFolders(root);
  const activeSet = new Set(activeFolders.map(f => f.issue_number).filter(n => n != null));

  const registeredWorktrees = listWorkflowWorktrees(root);
  const stale_worktrees = [];
  const active_worktrees = [];
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
    const raw = execFileSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)',
      'refs/heads/workflow/gitea-issue-*'], { encoding: 'utf8' }).trim();
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
  // #620: skipped_unmerged records a branch that survived because it could not be proven merged —
  // fail LOUD (visible in the JSON report) rather than silently either destroying it or dropping it.
  const buckets = { removed: [], deleted_branch: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [], skipped_unmerged: [], skipped_unprobeable: [] };
  const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [], skipped_unprobeable: [] };
  const removedBranches = new Set();

  for (const wt of stale_worktrees) {
    const branch = wt.branch.replace(/^refs\/heads\//, '');
    const state = wt.state; // 'clean' | 'dirty' | 'missing' | 'unprobeable'

    // #672 fail-closed: 'unprobeable' (the probe ITSELF failed — a broken git invocation, a
    // >maxBuffer porcelain, ...) is kept UNCONDITIONALLY, with zero override — unlike 'dirty'
    // (whose content IS known and CAN be overridden via --archive/--export/--force), an
    // unprobeable worktree's content was never even confirmed, so a probe failure must never
    // lead to removal.
    if (state === 'unprobeable') {
      (dryRun ? dryBuckets : buckets).skipped_unprobeable.push(wt.path);
      continue;
    }

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
  // #620: resolve the default branch ONCE (read-only, offline-safe) so every candidate is checked
  // against the same ancestry target — a stale-cleanup run must never force through unproven work.
  const defBranch = dryRun ? null : defaultBranch(root);
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
    const branchResult = removeBranchIfMerged(root, branch, defBranch);
    if (branchResult.removed) {
      buckets.deleted_branch.push(branch);
    } else if (branchResult.mode === 'skipped_unmerged') {
      buckets.skipped_unmerged.push({ branch, tip: branchResult.tip });
    }
  }

  if (dryRun) {
    output({ dry_run: true, ...dryBuckets });
  } else {
    output({ dry_run: false, ...buckets });
  }
}

function prNumberFromFolder(folder) {
  const direct = parseInt(folder.pr_number, 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(folder.pr_url || '').match(/\/pulls\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function watchMergeRequests(root, args) {
  let watched = 0;
  const warnings = [];
  const cleanups = [];
  const probeErrors = []; // #396.6: visible probe errors (a viewPullRequest failure was swallowed)
  const archiveRefusals = [];
  for (const folder of readActiveFolders(root, { excludeClosedIssues: false })) {
    // #396.6: bundle-aware --issue filter (match primary OR any bundle member, not the primary only).
    if (args.issue && folder.issue_iid !== args.issue &&
        !(Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(args.issue))) continue;
    if (folder.sink !== 'pr') continue;
    const prNumber = prNumberFromFolder(folder);
    if (!prNumber) continue;
    let state = '';
    try { state = forge.viewPullRequest(prNumber).state || ''; }
    catch (e) {
      // #396.6: record the error and do NOT count this folder as watched (was a silent watched:1 lie).
      probeErrors.push({ folder: folder.project, pr_number: prNumber, error: (e && e.message) ? e.message : String(e) });
      continue;
    }
    watched++;
    if (state === 'merged') {
      const archiveResult = archiveProjectDirSafely(root, folder.project, 'closed');
      if (!closureContract.archiveSucceeded(archiveResult)) {
        // #906: both halves — see cmdRelease. An entry that could not be compared refuses with an
        // EMPTY missing[], so reporting only that half names nothing at all.
        archiveRefusals.push({ folder: folder.project,
          reason: archiveResult.reason || (archiveResult.archive_incomplete ? 'archive_incomplete' : 'archive_refused'),
          detail: archiveResult.detail, missing: archiveResult.missing,
          mismatched: archiveResult.mismatched });
        continue;
      }
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
      // #328: for a bundle project, clear advisory claim per member; primary's status is canonical
      let claimLabelStatus;
      if (Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0) {
        for (const n of folder.issue_numbers) {
          const s = clearAdvisoryClaim(n, 'pr merged', { full_name: folder.full_name, html_url: folder.project_html_url }, folder.project);
          if (n === folder.issue_iid) claimLabelStatus = s;
        }
        if (claimLabelStatus == null) claimLabelStatus = 'failed';
      } else {
        claimLabelStatus = clearAdvisoryClaim(folder.issue_iid, 'pr merged', { full_name: folder.full_name, html_url: folder.project_html_url }, folder.project);
      }
      // #333: observe the primary issue's state at archive time (a merged PR does NOT imply a
      // closed issue — no close keyword keeps the issue open, the keep-open PR-sink case). watch
      // is online by construction (OFFLINE early-returns above); probeIssueState catches/degrades.
      const dispProbe = probeIssueState(folder.issue_iid);
      const issueDisposition = dispProbe.state === 'closed' ? 'closed'
        : (dispProbe.state === 'open' ? 'kept-open' : 'unknown');
      // #369: bundle-aware truthful receipt. watch is online by construction, so for a bundle probe
      // EVERY member, bucket each (closed/unavailable/open — never silent-neither), derive a truthful
      // token (all closed -> already_closed; else partial, never skipped_offline).
      const isBundle = Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0;
      const mClosed = [], mFailed = [], mOpen = [];
      let mergedRemoteToken = dispProbe.state === 'closed' ? 'already_closed' : 'skipped_offline';
      if (isBundle) {
        for (const n of folder.issue_numbers) {
          const p = (n === folder.issue_iid) ? dispProbe : probeIssueState(n);
          if (p.state === 'closed') mClosed.push(n);
          else if (p.state === 'unavailable') mFailed.push(n);
          else mOpen.push(n);
        }
        mergedRemoteToken = (mClosed.length === folder.issue_numbers.length) ? 'already_closed' : 'partial';
      }
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_iid, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'closed' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        remote_issue_closed: mergedRemoteToken,
        claim_label_removed: claimLabelStatus,
        worktree_removed: worktreeRemoved,
        branch_removed: 'kept'
      });
      // #328/#369: attach bundle receipt fields after builder (filter bypass) — incl. per-member buckets
      if (isBundle) {
        folderReceipt.issue_numbers = folder.issue_numbers;
        folderReceipt.closed_issues = mClosed.sort(function(a, b){ return a - b; });
        folderReceipt.failed_issue_closures = mFailed.sort(function(a, b){ return a - b; });
        folderReceipt.open_issues = mOpen.sort(function(a, b){ return a - b; });
        folderReceipt.roadmap_sources_removed = archiveResult ? (archiveResult.roadmap_sources_removed || []) : [];
      }
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      // #333: append the terminal receipt to the archived state. watch archives into the MAIN
      // working tree without committing; the append lands inside the untracked archive dir.
      // Disposition is OBSERVATION-derived here (vs DECISION-derived on cmdFinalize).
      if (archiveResult && archiveResult.dest) {
        appendClosureBlock(archiveResult.dest, {
          issueDisposition: issueDisposition,
          claimLabelRemoved: claimLabelStatus,
          worktreeRemoved: worktreeRemoved,
          closureInvariants: folderInvariants.ok ? 'ok' : ('violations:' + folderInvariants.violations.length)
        });
      }
      cleanups.push({ folder: folder.project, claim_label_removed: claimLabelStatus, receipt: folderReceipt, closure_invariants: folderInvariants });
    } else if (state === 'closed') {
      // #715 F1: read base_branch BEFORE archiveProjectDir moves the state file — the sweep has no
      // restore logic, so the discard-archive commit may only run when the current checkout already
      // IS the base/surviving branch (the helper enforces the comparison).
      let sweepBaseBranch = '';
      try { sweepBaseBranch = field(fs.readFileSync(folder.state_file, 'utf8'), 'base_branch'); } catch (_) {}
      // #715 N5-A: the sweep has ONLY the pre-read state base (operator-controlled durable state)
      // and no restore step — the only base it can establish as surviving-and-integration is the
      // repo's default branch. Pass it as defaultBase so the helper refuses a falsified base
      // naming the current arbitrary lane (or any other non-default branch), and pass the
      // folder's own lane as the discarded branch.
      const sweepDefaultBase = defaultBranch(root);
      sweepBaseBranch = sweepBaseBranch || sweepDefaultBase;
      const archiveResult = archiveProjectDirSafely(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
      if (!closureContract.archiveSucceeded(archiveResult)) {
        // #906: both halves — see cmdRelease. An entry that could not be compared refuses with an
        // EMPTY missing[], so reporting only that half names nothing at all.
        archiveRefusals.push({ folder: folder.project,
          reason: archiveResult.reason || (archiveResult.archive_incomplete ? 'archive_incomplete' : 'archive_refused'),
          detail: archiveResult.detail, missing: archiveResult.missing,
          mismatched: archiveResult.mismatched });
        continue;
      }
      // #715: commit the discard archive so the next sink's preflight does not refuse it as
      // foreign dirt. #715 F1: guarded to the base/surviving branch INSIDE the helper — off-base
      // the commit is skipped, the archive stays on disk as recoverable residue, and the cleanup
      // entry truthfully reports committed:false with the current branch disclosed. Local git
      // (OFFLINE must not skip it); never throws — a failure is recorded loudly on the emitted
      // cleanup entry instead of stranding the sweep.
      const discardCommit2 = commitDiscardArchive(archiveResult, folder.project, sweepBaseBranch,
        { discardedBranch: folder.branch || null, defaultBase: sweepDefaultBase });
      let worktreeRemoved = 'failed';
      try {
        const wtResult = removeWorktree(root, folder.project, folder);
        if (wtResult && wtResult.removed === true) worktreeRemoved = 'removed';
        else if (wtResult && wtResult.removed === false && wtResult.reason === 'missing') worktreeRemoved = 'missing';
        else if (wtResult && wtResult.removed === false) worktreeRemoved = 'failed';
      } catch (_) { worktreeRemoved = 'failed'; }
      // #328: for a bundle project, clear advisory claim per member; primary's status is canonical
      let claimLabelStatus2;
      if (Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0) {
        for (const n of folder.issue_numbers) {
          const s = clearAdvisoryClaim(n, 'pr closed', { full_name: folder.full_name, html_url: folder.project_html_url }, folder.project);
          if (n === folder.issue_iid) claimLabelStatus2 = s;
        }
        if (claimLabelStatus2 == null) claimLabelStatus2 = 'failed';
      } else {
        claimLabelStatus2 = clearAdvisoryClaim(folder.issue_iid, 'pr closed', { full_name: folder.full_name, html_url: folder.project_html_url }, folder.project);
      }
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_iid, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'abandoned' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        remote_issue_closed: 'skipped_offline',
        claim_label_removed: claimLabelStatus2,
        worktree_removed: worktreeRemoved,
        branch_removed: 'kept'
      });
      // #328: attach bundle receipt fields after builder (filter bypass)
      if (Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0) {
        folderReceipt.issue_numbers = folder.issue_numbers;
        folderReceipt.roadmap_sources_removed = archiveResult ? (archiveResult.roadmap_sources_removed || []) : [];
      }
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      const cleanupEntry2 = { folder: folder.project, claim_label_removed: claimLabelStatus2,
        discard_archive_committed: discardCommit2.committed,
        // #715 F1: disclose the receiving (or non-receiving) branch on BOTH success and skip.
        discard_archive_branch: discardCommit2.branch };
      if (!discardCommit2.committed) cleanupEntry2.discard_archive_commit_detail = discardCommit2.detail;
      // #755: the sweep is the SECOND caller of the relaxed abandon archive, and unlike
      // release it is automatic — driven by remote PR state, not an operator's discard. Say
      // out loud when it proceeded past a run-state-progress authority failure, so the
      // downgrade is never observable only by diffing the archived folder.
      if (archiveResult.authority_downgraded) {
        cleanupEntry2.authority_downgraded = archiveResult.authority_downgraded;
      }
      cleanupEntry2.receipt = folderReceipt;
      cleanupEntry2.closure_invariants = folderInvariants;
      cleanups.push(cleanupEntry2);
    }
  }
  return { watched, warnings, cleanups, probeErrors, archiveRefusals };
}

function cmdWatchPr() {
  if (OFFLINE) { output({ watched: 0, offline: true }); return; }
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const { watched, warnings, cleanups, probeErrors, archiveRefusals } = watchMergeRequests(root, args);
  const emit = { watched };
  if (warnings && warnings.length > 0) emit.warnings = warnings;
  if (cleanups && cleanups.length > 0) emit.cleanups = cleanups;
  if (probeErrors && probeErrors.length > 0) emit.probe_errors = probeErrors; // #396.6
  if (archiveRefusals && archiveRefusals.length > 0) emit.archive_refusals = archiveRefusals;
  output(emit, archiveRefusals && archiveRefusals.length > 0 ? 1 : 0);
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

// #676: the evidence files whose silent loss during archiving would drop finalization / per-node
// gate evidence. Enumerate the ones that ACTUALLY EXIST in the live SOURCE folder — this is the
// SOURCE-RELATIVE completeness set. A minimal project (only workflow-state.md) yields just that; a
// full adaptive run yields the frozen workflow-plan.md + workflow-state.md + finalization-summary.md
// + EVERY per-node .cache/*.md gate-evidence file.
// Nothing the source never had is ever demanded, so the gate can never break a minimal fixture — it
// only fires when a copy genuinely dropped a file the source held.
//
// A node id is free-form [A-Za-z0-9_-]+ (sanitizeNodeId), NOT an n<digits>-<slug> grammar, so real
// gate evidence is named design.md / review.md / finalize.md / t414.md / parity-anchor.md /
// planner.md / code-reviewer.md / tdd-guide.md / security-reviewer.md / n1.md / … — a name-shape glob
// silently misses ALL of these. Enumerate EVERY .cache/*.md and subtract only the fixed-name finalize
// / machinery sub-step sidecars below (which are NOT per-node gate evidence). Over-inclusion is
// fail-closed-safe because copyDir is fully recursive — a faithful archive already carries every
// .cache/*.md the source held, so requiring extra can never false-refuse a genuine copy. Non-.md
// artifacts (run-gaps.json, chain-receipt.json, barrier-*/dispatch/provenance/running-set) are not
// gate evidence and are excluded by the .md filter.
const ARCHIVE_CACHE_SIDECAR_MD = new Set([
  'final-validation.md',   // finalize validation-gate evidence (column-0 verdict: pass); archiveProjectDir normalizes it by name
  'run-gaps-manual.md',    // manual gap-sweep annotations sidecar
  'selection-evidence.md', // issue-selection evidence sidecar
  'doc-docking.md',        // finalize Documentation-Docking sub-step (DOCKED/BLOCKED)
  'doc-updater.md',        // finalize doc-updater sub-step output
]);

// #901: the exempt sidecars a LIVE copy holds and the archive destination does not. The byte
// verifier below skips these on purpose (a normalized sidecar may legitimately differ from its
// source), which left the pre-deletion gate with no statement about them at all — and four of the
// five evidence files the incident lost live in this set. PRESENCE is strictly weaker than
// byte-identity and costs one readdir. Called once per live copy that is about to be deleted, so
// the answer is about THAT copy: an unreadable `.cache` contributes nothing rather than throwing.
function missingArchiveSidecars(liveDir, destDir) {
  const missing = [];
  try {
    for (const entry of fs.readdirSync(path.join(liveDir, '.cache'), { withFileTypes: true })) {
      if (!entry.isFile() || !ARCHIVE_CACHE_SIDECAR_MD.has(entry.name)) continue;
      if (!fs.existsSync(path.join(destDir, '.cache', entry.name))) missing.push('.cache/' + entry.name);
    }
  } catch (_) { /* no readable .cache in this copy — nothing exempt to re-check */ }
  return missing;
}
function listSourceEvidenceFiles(srcDir) {
  const rels = [];
  // #906: the fixed names come from the KERNEL, not from a hand-typed list. This port carried three
  // names where the canonical and Codex editions carry four: `mission-list.md` — the ADR 0017 run
  // record itself — was absent, so on this edition alone a main-only `mission-list.md` was outside the
  // required set and the archive-and-delete took it at exit 0. Measured by running all four editions'
  // exported verifyArchiveComplete over one identical fixture. Reading the constants closes the set by
  // construction rather than by a fourth hand-typed copy.
  for (const f of [adaptiveSchema.MISSION_LIST_FILE, adaptiveSchema.PLAN_FILE,
                   'workflow-state.md', 'finalization-summary.md']) {
    if (fs.existsSync(path.join(srcDir, f))) rels.push(f);
  }
  let cacheEntries = [];
  try { cacheEntries = fs.readdirSync(path.join(srcDir, '.cache')); } catch (_) { cacheEntries = []; }
  for (const name of cacheEntries) {
    if (name.endsWith('.md') && !ARCHIVE_CACHE_SIDECAR_MD.has(name)) rels.push(path.join('.cache', name));
  }
  return rels;
}

// #426/#676: verify a freshly-COPIED archive preserved every evidence file the live SOURCE held,
// BEFORE either live copy is deleted. SOURCE-RELATIVE (see listSourceEvidenceFiles): `srcDir` is
// the live folder, `destDir` the copied archive. Returns { ok, missing } where `missing` lists the
// source-present relative paths absent from dest (a lossy copy). Only the copy+verify linked-run
// path calls this; the in-place renameSync path relocates the whole dir atomically and cannot drop
// anything, so it is trivially complete and does not call this.
//
// workflow-state.md is additionally required UNCONDITIONALLY as the archive's identity anchor:
// archiveProjectDir only ever runs for a claimed project (which always writes workflow-state.md at
// claim time), and an archived folder lacking it is unusable. This is NOT the rejected absolute
// evidence floor — plan / summary / node-evidence stay strictly source-relative —
// it is the single #426 archive-integrity invariant (a state-less source is malformed and must not
// be deleted before its archive is proven to carry the state file).
//
// The completeness property is a MEASUREMENT, not a declaration: the archive is complete iff every
// file present under the run folder before the move is present, byte-for-byte, after it. It used to
// be reinforced by a required set DERIVED from the run record — every `complete` ledger row implies
// its `.cache/<id>.md` — which is the same "declared set" the finalize attribution sweep rested on,
// one layer down, and it goes for the same reason: there is no ledger to derive it from. Nothing is
// weakened at the door that matters, because the recursive source walk below already requires every
// file the source holds, including the ones no ledger row ever implied.
//
// The refusal STAYS. Losing a durable record while moving it is exactly the irreversible harm a
// refusal is for, and this one fires before either live copy is deleted.
function verifyArchiveComplete(srcDir, destDir) {
  if (!fs.existsSync(destDir)) return { ok: false, missing: ['<dest>'], mismatched: [], uncomparable: [] };
  try {
    const srcRoot = fs.lstatSync(srcDir);
    const destRoot = fs.lstatSync(destDir);
    if (!srcRoot.isDirectory() || srcRoot.isSymbolicLink()
        || !destRoot.isDirectory() || destRoot.isSymbolicLink()) {
      return { ok: false, missing: [], mismatched: ['<root>'], uncomparable: ['<root>'] };
    }
  } catch (_) { return { ok: false, missing: ['<root>'], mismatched: [], uncomparable: [] }; }
  const sourceFiles = new Map();
  const invalid = [];
  const walk = function(absDir, relDir) {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
    catch (_) { invalid.push(relDir || '<source>'); return; }
    entries.sort(function(a, b) { return a.name.localeCompare(b.name); });
    for (const entry of entries) {
      const rel = relDir ? relDir + '/' + entry.name : entry.name;
      // Preserve the long-standing archive contract: fixed finalize/machinery
      // markdown sidecars are optional, while authored plans, state, summaries,
      // node evidence, authority receipts, and every other source file remain
      // byte-checked recursively.
      if (relDir === '.cache' && entry.isFile() && ARCHIVE_CACHE_SIDECAR_MD.has(entry.name)) continue;
      const abs = path.join(absDir, entry.name);
      let stat;
      try { stat = fs.lstatSync(abs); } catch (_) { invalid.push(rel); continue; }
      if (stat.isSymbolicLink()) { invalid.push(rel); continue; }
      if (stat.isDirectory()) { walk(abs, rel); continue; }
      if (!stat.isFile()) { invalid.push(rel); continue; }
      sourceFiles.set(rel, {
        size: stat.size,
        mode: stat.mode & 0o777,
        digest: require('crypto').createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
      });
    }
  };
  walk(srcDir, '');
  // Retain the historical identity/evidence floor even if an unreadable source
  // subtree prevented the recursive enumerator from observing it.
  const required = new Set(listSourceEvidenceFiles(srcDir));
  required.add('workflow-state.md');
  for (const rel of sourceFiles.keys()) required.add(rel);
  const missing = [];
  // #906: `invalid[]` is the source-side kind fault — an entry the walk could not reduce to bytes. It
  // seeds BOTH halves: mismatched keeps it (every reader that had it still has it) and uncomparable
  // names it as the thing it actually is, so "cannot be compared" stops hiding inside "bytes differ".
  // uncomparable is a strict SUBSET of mismatched, never a replacement, and there is still exactly one
  // walk and one call — adding a third comparison READER is how the hole this closes was formed.
  const mismatched = invalid.slice();
  const uncomparable = invalid.slice();
  for (const rel of Array.from(required).sort()) {
    const dest = path.join(destDir, ...String(rel).split('/'));
    if (!fs.existsSync(dest)) { missing.push(rel); continue; }
    const expected = sourceFiles.get(rel);
    if (!expected) continue;
    let stat;
    try { stat = fs.lstatSync(dest); } catch (_) { missing.push(rel); continue; }
    // The DEST-side kind fault. Also a "could not be compared", not a "bytes differ": there are no
    // bytes to weigh against the source's.
    if (!stat.isFile() || stat.isSymbolicLink()) { mismatched.push(rel); uncomparable.push(rel); continue; }
    const digest = require('crypto').createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    if (stat.size !== expected.size || (stat.mode & 0o777) !== expected.mode || digest !== expected.digest) {
      mismatched.push(rel);
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched, uncomparable };
}

function cmdWorktreeFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
  assert(folder && folder.worktree_path, 'worktree-finalize: active folder has no worktree_path');
  copyDir(folder.project_dir, path.join(folder.worktree_path, 'kaola-workflow', folder.project));
  // #398.3: pathspec'd stage + commit (the prior inverted try/commit-as-catch swept a pre-staged
  // UNRELATED file into the finalize commit). Stage only the project path; commit ONLY that pathspec.
  const projectPathspec = 'kaola-workflow/' + folder.project + '/';
  try {
    execFileSync('git', ['-C', folder.worktree_path, 'add', '--', projectPathspec], { stdio: 'inherit' });
  } catch (_) { /* staging failure — do NOT cascade into a commit */ }
  let hasStaged = false;
  try { execFileSync('git', ['-C', folder.worktree_path, 'diff', '--cached', '--quiet', '--', projectPathspec], { stdio: 'ignore' }); }
  catch (e) { if (e && e.status === 1) hasStaged = true; }
  if (hasStaged) {
    execFileSync('git', ['-C', folder.worktree_path, 'commit', '-m', 'chore: finalize ' + folder.project, '--', projectPathspec], { stdio: 'inherit' });
  }
  output({ finalized: true, project: folder.project, worktree_path: folder.worktree_path });
}

function cmdSinkFallback() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  assert(isSafeName(args.project), 'unsafe project name');
  const reason = args.reason || 'merge fallback';
  const archivePath = path.join(root, 'kaola-workflow', 'archive', args.project);
  const liveExists = fs.existsSync(projectDir(root, args.project));
  const archiveExists = fs.existsSync(archivePath);
  // Transient/abnormal co-existence (live AND archive present) — keep the original no-op guard.
  if (liveExists && archiveExists) {
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
  // #394: when the live folder is GONE but the archive is present (standard exit-3 lane archives
  // before the sink), operate on the ARCHIVED state so the fallback chain can flip sink:pr there.
  if (!liveExists) {
    const archiveState = path.join(archivePath, 'workflow-state.md');
    if (archiveExists && fs.existsSync(archiveState)) {
      const updated = fs.readFileSync(archiveState, 'utf8')
        .replace(/^sink:.*$/m, 'sink: pr')
        .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason);
      writeFile(archiveState, updated);
      output({ updated: true, archived: true, project: args.project, sink: 'pr', reason });
      return;
    }
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
  updateState(root, args.project, content => content
    .replace(/^sink:.*$/m, 'sink: pr')
    .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason));
  output({ updated: true, project: args.project, sink: 'pr', reason });
}

// #617: pure helper — true iff implRef is an ancestor of sinkTarget in root. Shared by
// checkClosureInvariants (the wired invariant) and cmdVerifySink (the standalone audit).
function verifyImplPublished(root, implRef, sinkTarget) {
  if (!implRef || !sinkTarget) return false;
  try {
    execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', implRef, sinkTarget], { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

// #617: cmdVerifySink — a standalone audit an operator (or a next session) can run independently
// of the merge sink itself, to catch exactly the incident this issue fixes: an issue closed while
// its implementation never actually landed on the sink target. Given --project P, checks:
//   (a) the recorded implementation commit (from the live-or-archived sink-receipt.json, falling
//       back to a still-lingering feature branch) is an ancestor of the resolved default branch;
//   (b) no lingering .kw/worktrees/<project> and no lingering workflow branch;
//   (c) the archive folder is present and the active folder is gone.
// Exits non-zero with a typed `reasons` array on ANY failing leg; exits 0 with a clean report
// otherwise. Pure read — never mutates anything.
function cmdVerifySink() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  assert(isSafeName(args.project), 'unsafe project name');

  const reasons = [];
  const checks = {};

  // (c) archive present + active folder gone.
  const activeDir = projectDir(root, args.project);
  const archiveDir = path.join(root, 'kaola-workflow', 'archive', args.project);
  const activeGone = !fs.existsSync(activeDir);
  const archivePresent = fs.existsSync(archiveDir);
  checks.active_folder = activeGone ? 'gone' : 'present';
  checks.archive_folder = archivePresent ? 'present' : 'missing';
  if (!activeGone) reasons.push('active_folder_still_present');
  if (!archivePresent) reasons.push('archive_folder_missing');

  // (b) no lingering worktree / branch. Resolve the branch name from whichever state file exists.
  let branchName = null;
  for (const p of [stateFile(root, args.project), path.join(archiveDir, 'workflow-state.md')]) {
    try { branchName = field(fs.readFileSync(p, 'utf8'), 'branch') || branchName; if (branchName) break; } catch (_) {}
  }
  const wtPath = worktreePathFor(root, args.project);
  const worktreeLingering = fs.existsSync(wtPath);
  checks.worktree = worktreeLingering ? 'lingering' : 'absent';
  if (worktreeLingering) reasons.push('worktree_lingering');

  let branchLingering = false;
  if (branchName) {
    try {
      execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + branchName],
        { stdio: ['ignore', 'ignore', 'ignore'] });
      branchLingering = true;
    } catch (_) { branchLingering = false; }
  }
  checks.branch = branchLingering ? 'lingering' : 'absent';
  if (branchLingering) reasons.push('branch_lingering');

  // (a) the recorded implementation commit must be an ancestor of the sink target. Prefer the
  // durable sink-receipt.json (live or archived) published_head; fall back to resolving the
  // branch name directly when it still exists.
  // #631: branch_head is stamped ONCE at receipt init, before a mid-flight rebase rewrites the
  // branch's commits — a rebase orphans that SHA even though the (rebased) content genuinely
  // landed on the sink target, so a clean rebased sink false-alarmed impl_commit_not_ancestor.
  // published_head (additive; stamped at the closure gate once the live tip resolves as actually
  // published) is the FRESH ref — prefer it, falling back to branch_head only for legacy receipts
  // that predate the field.
  let implRef = null;
  for (const p of [
    path.join(activeDir, '.cache', 'sink-receipt.json'),
    path.join(archiveDir, '.cache', 'sink-receipt.json'),
  ]) {
    try {
      const r = JSON.parse(fs.readFileSync(p, 'utf8'));
      const ref = r && (r.published_head || r.branch_head);
      if (ref) { implRef = ref; break; }
    } catch (_) {}
  }
  if (!implRef && branchLingering) {
    try {
      implRef = execFileSync('git', ['-C', root, 'rev-parse', branchName], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (_) {}
  }
  const sinkTarget = defaultBranch(root);
  checks.impl_commit = implRef || null;
  checks.sink_target = sinkTarget;
  if (!implRef) {
    // No trace of the implementation commit anywhere — the expected shape of a cleanly-completed
    // sink (worktree AND branch both already gone). Only suspicious alongside a lingering
    // worktree/branch (something survived but we cannot verify it), so only flag it then.
    checks.merged_into_sink_target = 'unknown';
    if (worktreeLingering || branchLingering) reasons.push('impl_commit_unresolvable_with_lingering_branch');
  } else if (!verifyImplPublished(root, implRef, sinkTarget)) {
    checks.merged_into_sink_target = 'not_ancestor';
    reasons.push('impl_commit_not_ancestor');
  } else {
    checks.merged_into_sink_target = 'verified';
  }

  const ok = reasons.length === 0;
  output({ project: args.project, ok, checks, reasons }, ok ? 0 : 1);
}

function cmdAuditLabels() {
  if (OFFLINE) { output({ stale: [], offline: true }); return; }
  const stale = forge.listIssues({ state: 'closed', labels: [CLAIM_LABEL] })
    .map(it => ({ number: it.number, title: it.title, url: it.web_url }));
  output({ stale, count: stale.length });
}

// #686 R4: enumerate EVERY worktree of the repo rooted at `mainRoot` via `git worktree list
// --porcelain` (the shared common dir lists every linked worktree regardless of which one invokes
// it) — the main checkout, every `.kw/worktrees/<project>` linked run, and every leg under
// `.kw/legs/<project>/<node>` (legs are real `git worktree add` checkouts, covered for free). This
// is the FULL reachable claim-root universe: a live claim's kaola-workflow/<project>/ folder can
// live under ANY one of these roots, never more than one. Returns { ok:true, roots:[...] }
// (path.resolve'd, one entry per `worktree ` line) on success, or { ok:false } if the `git worktree
// list` invocation itself throws — the CALLER fails closed on ok:false (see sweepBarrierRefs below):
// an unscannable worktree set means no tag can be proven dead, so nothing may be deleted.
// KAOLA_WORKFLOW_FORCE_BARRIER_WT_LIST_FAIL=1 is a [TEST ONLY] seam to deterministically exercise
// that fail-closed path. Never set in production; it only makes the probe we already run throw.
//
// #686 R6/R7 (n3-adversary attempt 2): plain `--porcelain` uses a bare LF as both the field AND
// record terminator, so it cannot round-trip a worktree path that itself contains an LF (R6 — the
// path is emitted RAW across two physical lines, corrupting the split) or a path with meaningful
// trailing whitespace (R7 — indistinguishable from terminator padding, so a `.trim()` on the
// extracted field silently eats part of the path). Both turn a LIVE worktree root into a wrong,
// nonexistent path, making that root unscannable and its live claim invisible to the keep-set scan.
// FIX: `--porcelain -z` (git 2.36+; confirmed supported on this machine's 2.54.0) terminates every
// field AND every record with NUL instead of LF, so a path may contain ANY byte — including LF or
// trailing spaces — and is still emitted byte-exact between NULs, unambiguous to parse. Split on
// NUL, take fields whose prefix is the literal `worktree `, and slice off ONLY that prefix with NO
// `.trim()` — the remaining bytes up to the NUL ARE the path, verbatim (trimming would reintroduce
// R7 for a real trailing-space path). Record boundaries (a blank field between worktrees) are
// harmless to ignore since we only ever look for `worktree `-prefixed fields.
//
// Deliberately NOT added: a "parsed root must exist on disk ⇒ abort" backstop. With this -z parse,
// R6/R7 paths now parse CORRECTLY (the real path exists and is scanned) — a nonexistent-on-disk
// parsed root under -z means a genuinely prunable worktree (its directory was deleted out from
// under git without `worktree prune`/`remove`), which is a BENIGN case whose claims are legitimately
// dead. Aborting the whole sweep on that would spuriously block reaping in an ordinary, safe
// situation — the fail-closed posture belongs on "the enumeration itself failed" (already handled
// below), not on "one enumerated path happens not to exist" (handled per-root, fail-soft, by the
// caller's scan already tolerating an empty/unreadable root).
function listBarrierSweepWorktreeRoots(mainRoot) {
  let out;
  try {
    if (process.env.KAOLA_WORKFLOW_FORCE_BARRIER_WT_LIST_FAIL === '1') {
      throw new Error('forced git worktree list probe failure [TEST ONLY]');
    }
    out = execFileSync('git', ['worktree', 'list', '--porcelain', '-z'],
      { cwd: mainRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {
    return { ok: false, roots: [] };
  }
  const roots = [];
  for (const field of String(out || '').split('\0')) {
    if (field.indexOf('worktree ') !== 0) continue;
    roots.push(path.resolve(field.slice('worktree '.length)));
  }
  return { ok: true, roots };
}

// #686: legacy keep-set sweep — reclaims refs/kaola-workflow/barrier/<tag>/* refs left behind by
// projects archived BEFORE the #686 archive-time reap shipped (or by any path that ever bypassed
// archiveProjectDir). Scoped STRICTLY to the `barrier/` prefix — never `leg-base/` (a separate ref
// namespace owned by leg provisioning/teardown) and never `barrier-base/` (that is only a `.cache/`
// FILE-name prefix, not a ref namespace at all — confirmed by grepping the whole tree).
//
// KEEP set = sanitizeBarrierTag(project) for every ACTIVE kaola-workflow/<project>/ folder
// (readActiveFolders — reused, not re-implemented) UNION sanitizeBarrierTag(project) for every
// kaola-workflow/<project>/ folder — active or not — carrying a live .cache/running-set.json. The
// active-folder probe is called with excludeClosedIssues:false so this purely-local ref sweep never
// depends on a forge (`tea`) round-trip: a network fault must never turn into an over-reap, so
// "cannot be probed ⇒ KEEP" degrades here to "never probes" — folder presence + local status is the
// whole signal.
//
// #686 R1 (superseded by R4 below): the original fix scanned the UNION of `root` (the invoking
// cwd's own repo root) and `mainRoot` (resolveMainRoot(root) — the shared git-common-dir owner).
// That closed HALF the class: a claim made from some OTHER linked worktree (or a `.kw/legs/`
// provisioning leg) writes its live folder under THAT root alone, invisible to both `root` and
// `mainRoot`.
//
// #686 R4 (n3-adversary attempt 1): the reachable claim-root universe is EVERY linked worktree, not
// just {root, mainRoot} — there is no lane/cwd fence on `claim`, so a real claim from any worktree
// cwd anchors its folder + barrier refs there. scanRoots is now the FULL `git worktree list
// --porcelain` set (listBarrierSweepWorktreeRoots, rooted at mainRoot) — a strict superset of
// {root, mainRoot} that covers both for free (root and mainRoot are themselves always worktrees of
// the repo). FAIL-CLOSED on enumeration failure: if the worktree-list probe itself throws, the whole
// sweep aborts BEFORE any ref is touched — stricter than the sweep's general fail-soft below, and
// deliberately so: the sweep's entire job is safe deletion, and an unscanned worktree set means it
// cannot prove any tag is dead.
//
// A fault reading a SINGLE root's readActiveFolders/running-set scan (e.g. an unreadable
// kaola-workflow/ dir on one worktree) is handled by the OUTER fail-soft below, NOT swallowed
// per-root: the keep set is built to completion BEFORE any ref is enumerated or deleted, so a
// mid-build exception aborts the WHOLE sweep with zero deletions issued — the conservative
// "keep everything" choice, not "this root contributes nothing" (which would risk deleting a tag
// whose only liveness evidence lived in the unreadable root). Chosen because correctness (axiom 1)
// outranks completing a partial sweep.
//
// #686 R5 (n3-adversary attempt 1): on a case-insensitive filesystem (macOS default), a wrong-case
// `--record-base` path anchors a barrier ref tag in a different case than the live folder's actual
// dirent (projTag is recorded EXACTLY as given, plan-validator.js — never case-normalized), so an
// exact-case keep lookup misses it. The keep membership check below is CASE-FOLDED — a tag is kept
// if it matches a keep-set entry under case-folding — which only ever ADDS matches (fail-safe
// under-reap on every FS, case-sensitive or not). The archive-time reap (archiveProjectDir) is
// exact-tag-scoped to ONE already-known project name at archive time (no cross-tag keep/delete
// decision at all), so it is out of scope for this case-fold — confirmed by inspection above.
//
// #686 R8 (n3-adversary attempt 3): readActiveFolders (shared, active-folders.js) treats a
// workflow-state.md that EXISTS but whose fs.readFileSync throws (EACCES via chmod, EISDIR because
// the path is actually a directory, or any other read fault) as a per-folder parse failure and
// silently `continue`s past it (active-folders.js:246) — that folder never makes it into the active
// set at all. For a SEQUENCE run (no .cache/running-set.json — the common case; signal (b) below is
// then empty), the dropped folder has NO other keep signal, so its barrier gc-anchor gets reaped even
// though the state file's mere PRESENCE is liveness evidence this sweep cannot disprove. That
// contradicts this sweep's own "cannot prove dead ⇒ keep" discipline, which today binds only at
// DIRECTORY granularity (the R4 fail-closed enumeration abort above) and not at file granularity.
// FIX (tighten-only, sweep-local — readActiveFolders' shared continue-on-parse-fault semantics are
// UNCHANGED, since other #353 consumers depend on them): an independent pass (c) below walks the same
// per-scanRoot project-folder listing as (b) and adds a project's tag to keep whenever its
// workflow-state.md exists but cannot be read — never when the state file is simply absent (that
// folder carries no liveness evidence at all and is correctly left out, i.e. correctly reapable).
// Only ever ADDS to keep — fail-safe under-reap, mirroring the R5 case-fold and #680 discipline below.
//
// Mirrors the #680 orphan-baseline sweep discipline (adaptive-node.js runReconcileRunningSet):
//   (1) sanitizer collisions (and now case-folding) only ever ADD to KEEP — fail-safe under-reap,
//       never over-reap;
//   (2) any tag whose ownership survives EITHER keep-pass in ANY worktree root is kept — ambiguity
//       resolves to KEEP;
//   (3) fail-soft — any error (other than the R4 enumeration fail-closed above) aborts the sweep
//       silently (never throw; whatever ref deletes already executed before the fault stand — an
//       already-issued `git update-ref -d` cannot be undone, and re-throwing would only turn a
//       partial cleanup into a crash).
function sweepBarrierRefs(root) {
  const summary = { result: 'ok', refsDeleted: [], tagsKept: [], tagsDeleted: [] };
  try {
    const mainRoot = resolveMainRoot(root) || root;
    const keep = new Set();

    // #686 R4: FAIL-CLOSED on an unscannable worktree set — abort before touching a single ref.
    const wtList = listBarrierSweepWorktreeRoots(mainRoot);
    if (!wtList.ok) {
      summary.aborted = true;
      summary.reason = 'worktree_enum_failed';
      return summary;
    }
    // Union with `root`/`mainRoot` defensively (git worktree list always includes both in practice —
    // both are worktrees of the very repo mainRoot was derived from — but the union costs nothing
    // and removes any dependency on that always-true assumption). Set dedupes a plain repo (no
    // worktree split) down to one scan.
    const scanRoots = Array.from(new Set([...wtList.roots, path.resolve(root), path.resolve(mainRoot)]));

    for (const scanRoot of scanRoots) {
      // (a) active-folder KEEP set (fs+local-status only — no forge round-trip).
      const active = readActiveFolders(scanRoot, { excludeClosedIssues: false });
      for (const f of active) keep.add(sanitizeBarrierTag(f.project));

      // (b) live running-set.json KEEP — an independent OR signal. Walks EVERY project folder (not
      // just the active-status ones) so a folder caught mid status-transition with a live running set
      // is still protected.
      const workflowDir = path.join(scanRoot, 'kaola-workflow');
      let entries = [];
      try { entries = fs.readdirSync(workflowDir, { withFileTypes: true }); } catch (_) { entries = []; }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'archive' || entry.name.startsWith('.') || !isSafeName(entry.name)) continue;
        if (fs.existsSync(path.join(workflowDir, entry.name, '.cache', 'running-set.json'))) {
          keep.add(sanitizeBarrierTag(entry.name));
        }
      }

      // (c) #686 R8 + #691 R10 (a sibling): present-but-UNPROBEABLE workflow-state.md KEEP — an
      // independent pass over the SAME entries listing as (b). readActiveFolders drops (never
      // re-implemented here — see the R8 doc paragraph above) a folder whose state file exists but
      // fails to read; that folder's ONLY liveness evidence is otherwise lost. A single fs.statSync
      // (then a readFileSync attempt, both inside ONE try) distinguishes a clean ENOENT (genuinely
      // absent — no liveness evidence, correctly reapable) from ANY OTHER fault (EACCES/EISDIR/EPERM/…
      // — unprobeable, KEEP). #691: `fs.existsSync(stateFile)` alone cannot make this distinction — it
      // returns false both when the state file is genuinely absent AND when it is merely unreachable
      // because the PARENT project directory itself is chmod-000 (EACCES-through-parent), so a live
      // project whose directory (not just its state file) is unreadable was wrongly dropped from keep.
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'archive' || entry.name.startsWith('.') || !isSafeName(entry.name)) continue;
        const stateFile = path.join(workflowDir, entry.name, 'workflow-state.md');
        try {
          fs.statSync(stateFile);
          fs.readFileSync(stateFile, 'utf8');
          // readable — already covered (or correctly excluded) by pass (a) above.
        } catch (e) {
          if (e && e.code !== 'ENOENT') keep.add(sanitizeBarrierTag(entry.name));
        }
      }
    }
    // #686 R5: case-folded lookup set — built ALONGSIDE (never replacing) `keep`, so tagsKept still
    // reports the tag's real discovered case while the membership test below ignores case entirely.
    const keepLower = new Set(Array.from(keep, s => s.toLowerCase()));

    // Enumerate every refs/kaola-workflow/barrier/<tag>/* ref, grouped by <tag>.
    const prefix = 'refs/kaola-workflow/barrier/';
    let listed = '';
    try {
      listed = execFileSync('git', ['for-each-ref', '--format=%(refname)', prefix],
        { cwd: mainRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (_) { listed = ''; }
    const byTag = new Map();
    // NEWLINE-SPLIT ON PURPOSE — ref names, not pathnames; see the archive-time reap above for the
    // two measurements (verbatim `%(refname)` output, and git's own refusal of LF/TAB/space/`\` in a
    // ref name) that make this split lossless and the `.trim()` a no-op.
    for (const refName of listed.split('\n').map(s => s.trim()).filter(Boolean)) {
      const rest = refName.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0) continue;
      const tag = rest.slice(0, slash);
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(refName);
    }

    for (const [tag, refs] of byTag.entries()) {
      if (keepLower.has(tag.toLowerCase())) { summary.tagsKept.push(tag); continue; }
      for (const refName of refs) {
        try {
          execFileSync('git', ['update-ref', '-d', refName], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
          summary.refsDeleted.push(refName);
        } catch (_) { /* fail-soft: a single ref-delete failure must not abort the sweep */ }
      }
      summary.tagsDeleted.push(tag);
    }
  } catch (_) {
    // fail-soft: any error aborts the sweep silently — never throw.
    summary.aborted = true;
  }
  return summary;
}

function cmdBarrierRefSweep() {
  const root = getRoot();
  output(sweepBarrierRefs(root));
}

function cmdRepairLabels() {
  const args = parseArgs(process.argv.slice(3));
  if (OFFLINE) { output({ dry_run: false, offline: true, removed: [], failed: [] }); return; }
  const stale = forge.listIssues({ state: 'closed', labels: [CLAIM_LABEL] })
    .map(it => ({ number: it.number, title: it.title, url: it.web_url }));
  const dryRun = !args.execute;
  if (dryRun) { output({ dry_run: true, would_remove: stale }); return; }
  const projectInfo = discoverProjectSafe();
  const removed = [], failed = [];
  for (const it of stale) {
    try { forge.updateIssueLabels(projectInfo, it.number, { remove: [CLAIM_LABEL] }); removed.push(it.number); }
    catch (_) { failed.push(it.number); }
  }
  output({ dry_run: false, removed, failed });
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
  const buckets = { removed: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [], skipped_unprobeable: [] };
  const dryBuckets = { would_remove: [], skipped_dirty: [], skipped_unprobeable: [] };

  for (const wt of legacyWorktrees) {
    const wtPath = wt.worktree;
    const branch = (wt.branch || '').replace(/^refs\/heads\//, '');
    const state = worktreeDirtyState(wtPath); // 'clean' | 'dirty' | 'missing' | 'unprobeable'

    // #672 fail-closed: 'unprobeable' (the probe ITSELF failed) is kept UNCONDITIONALLY, with zero
    // override — see cmdStaleWorktreeCleanup for the identical rationale. A probe failure must
    // never lead to removal.
    if (state === 'unprobeable') {
      (dryRun ? dryBuckets : buckets).skipped_unprobeable.push(wtPath);
      continue;
    }

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

const USAGE = 'usage: kaola-gitea-workflow-claim.js <claim|authoring-allowed|release|status|patch-branch|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|verify-sink|watch-pr|stale-worktree-check|stale-worktree-cleanup|legacy-worktree-cleanup|audit-labels|repair-labels|barrier-ref-sweep>\n'
  + '  flags: --project P [--json] [--force] [--strict] [--issue N] [--target-issue N] [--target-issues A,B] [--pr-number N]\n'
  + '         [--branch B] [--reason R] [--runtime claude|codex] [--sink merge|mr|pr] [--workflow-path VALUE (retired, ignored)]\n'
  + '         [--keep-worktree] [--keep-open|--keep-issue-open] [--keep-branch] [--execute] [--archive] [--export]\n'
  + '  finalize --project P --check [--json]\n'
  + '               ONE read-only pass over EVERY finalize precondition (mirror, workflow_state,\n'
  + '               implementation_commit, staging_guard, validation, dirty_paths). Emits\n'
  + '               { project, ok, checks, reasons }; exit 0 when ok. Reports ALL unmet\n'
  + '               preconditions together instead of one refusal per re-run. Zero side effects.\n'
  + '  --help, -h   print this usage and exit (no side effects).';

function main() {
  const sub = process.argv[2];
  // #476: --help / -h is ALWAYS a safe no-op — print usage and exit 0 with ZERO side effects, even on
  // a destructive subcommand (a help probe must never run a finalize+sink). Checked across the whole
  // argv (the flag may sit in the subcommand slot, e.g. `claim.js --help`).
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) { process.stdout.write(USAGE + '\n'); return; }
  // #476: reject UNRECOGNIZED flags with a typed `unknown_flag` refusal and ZERO mutation, BEFORE any
  // subcommand body. An unknown flag (a typo, a deprecated flag) used to be silently dropped and the
  // destructive subcommand ran to completion (the KaolaTerminal issue-85 orphan root cause).
  const topArgs = parseArgs(process.argv.slice(3));
  if (topArgs.unknownFlags && topArgs.unknownFlags.length) {
    const hint = 'Unrecognized flag(s): ' + topArgs.unknownFlags.join(', ') + '. Refusing with zero side effects — run `--help` for usage. An unknown flag must never fall through to a destructive subcommand.';
    if (topArgs.json) process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'unknown_flag', unknownFlags: topArgs.unknownFlags, operator_hint: hint }) + '\n');
    else process.stderr.write('kaola-gitea-workflow-claim: unknown_flag — ' + hint + '\n');
    process.exitCode = 1; return;
  }
  assert(sub, USAGE);
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
  if (sub === 'worktree-finalize') return cmdWorktreeFinalize();
  if (sub === 'sink-fallback') return cmdSinkFallback();
  if (sub === 'verify-sink') return cmdVerifySink();
  if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();
  if (sub === 'stale-worktree-cleanup') return cmdStaleWorktreeCleanup();
  if (sub === 'legacy-worktree-cleanup') return cmdLegacyWorktreeCleanup();
  if (sub === 'audit-labels') return cmdAuditLabels();
  if (sub === 'repair-labels') return cmdRepairLabels();
  if (sub === 'barrier-ref-sweep') return cmdBarrierRefSweep();
  throw new Error('unknown subcommand: ' + sub);
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  isSafeBranchArg,
  assertSafeBranchArg,
  assertNoNewline,
  classifyWorktreeError,
  // #775: --codex-dispatch-mode warn-and-ignore shim (v2-task-name is the only mode).
  resolveCodexDispatchModeFlag,
  CODEX_DISPATCH_MODE_IGNORED_NOTE,
  removeBranch,
  removeBranchIfMerged,
  closeIssueIdempotent,
  postAdvisoryClaim,
  archiveProjectDir,
  buildBranchName,
  buildClosureReceipt,
  checkClosureInvariants,
  claimBundle,
  claimExplicitBundle,
  claimExplicitTarget,
  claimProject,
  buildClaimAnchors,
  clearAdvisoryClaim,
  cmdAuditLabels,
  cmdLegacyWorktreeCleanup,
  cmdRepairLabels,
  collectStale,
  computeClosePendingFinalize,
  defaultBranch,
  cmdStaleWorktreeCleanup,
  deriveRunPosture,
  getCoordRoot,
  mainRootFromCoord,
  resolveMainRoot,
  resolveSessionMarker,
  isProbeDegraded,
  legacySiblingWorktreePathFor,
  listOpenIssues,
  partitionActiveAndDrift,
  projectNameForIssue,
  provisionWorktree,
  readActiveFolders,
  readPriorityConfig,
  removeWorktree,
  watchMergeRequests,
  worktreePathFor,
  verifyImplPublished,
  verifyArchiveComplete,
  cmdVerifySink,
  // #686: barrier-ref archive-time reap (sanitizeBarrierTag) + the legacy keep-set sweep
  // (sweepBarrierRefs, cmdBarrierRefSweep) — exported for direct unit coverage.
  sanitizeBarrierTag,
  sweepBarrierRefs,
  cmdBarrierRefSweep,
  // #700: terminal archive-metadata writers reused by sink-merge's SOLE-archiver finalize path.
  // #816: the finalize-transaction primitives — exported for direct unit coverage of the three
  // behaviors that used to live as executable prose (artifact mirror incl. rename handling, the
  // ledger-regression guard's fail-open, and the single-project staging rule).
  mirrorFinalizationArtifacts,
  probeImplementationCommit,
  checkFinalizeStagingGuard,
  appendClosureBlock,
  // #715 F1: exported for direct unit coverage (restore-gate dest exemption + base-branch guard).
  treeDirty,
  commitDiscardArchive
};
