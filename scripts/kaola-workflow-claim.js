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
  readActiveFolders,
  getIssueStateSnapshot
} = require('./kaola-workflow-active-folders');

const roadmapModule = require('./kaola-workflow-roadmap');
const closureContract = require('./kaola-workflow-closure-contract');
// issue #227 (adaptive path): forge-neutral constants + toggle resolution.
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');
// #579: shared resolver — single source replacing local re-impls in claim.js / adaptive-node.js / sink-merge.js.
const { getCoordRoot, mainRootFromCoord, resolveMainRoot, parsePorcelainPaths, isParkedLanePath } = adaptiveSchema;
// #579: lane classifier (resolveSessionMarker + classifyLane) — imported in-process (no subprocess).
const { resolveSessionMarker, classifyLane } = require('./kaola-workflow-classifier');
// #441: parseGoal — reads the `goal:` line from ## Meta in workflow-plan.md.
const { parseGoal, parseLedger } = require('./kaola-workflow-plan-validator');

// Read the shared global config (the same ~/.config/kaola-workflow/config.json the
// classifiers read). Read-only here — never creates the file. Returns {} on any
// error so resolveInstalledPaths sees an absent/malformed `installed_paths` field
// and degrades to `[]` (adaptive-only legal — #538).
function readAdaptiveConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ...adaptiveSchema.CONFIG_REL_PATH), 'utf8'));
  } catch (_) {
    return {};
  }
}

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
// #356: bound every gh round-trip so a hung remote can never wedge a claim indefinitely (the
// other lifecycle scripts already cap at this; claim's ghExec was the one uncapped copy).
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();
const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE !== '0';
const CLAIM_LABEL = 'workflow:in-progress';
// #666: cap unbounded-in-repo-size git execFileSync calls at 64 MB — Node's execFileSync default
// maxBuffer is 1 MB, and a repo-size-scaling diff/listing can exceed it and crash with ENOBUFS.
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// M4 (#277): derive run_posture from the actual provisioning outcome.
// worktreePath truthy => 'worktree'; falsy => 'in-place'.
// Pure / unit-testable; no env reads.
function deriveRunPosture(worktreePath) {
  return worktreePath ? 'worktree' : 'in-place';
}

// #2 (opencode runtime label): resolve the runtime stamped into workflow-state.md.
// Precedence: explicit --runtime (args.runtime) wins; then KAOLA_RUNTIME; then INFER
// 'opencode' when an opencode model env is present (the opencode edition exports
// KAOLA_OPENCODE_INHERIT_MODEL / KAOLA_OPENCODE_STANDARD_MODEL); else default 'claude'.
// Pure (env passed in) — every site that previously hard-defaulted to 'claude' now routes
// through here so an opencode run is no longer mislabeled 'runtime: claude'.
function resolveRuntime(args, env) {
  args = args || {};
  env = env || {};
  return args.runtime
    || env.KAOLA_RUNTIME
    || ((env.KAOLA_OPENCODE_INHERIT_MODEL || env.KAOLA_OPENCODE_STANDARD_MODEL) ? 'opencode' : 'claude');
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
]);

// #603: the closed set of Codex dispatch-mode literals. The startup surface (preflight detection)
// passes exactly one of these via --codex-dispatch-mode; any other value — or a newline-carrying one
// (durable-state field injection, the assertNoNewline class) — refuses at claim with zero mutation.
const CODEX_DISPATCH_MODES = ['v2-task-name', 'v1-thread-id'];

// Validate the optional --codex-dispatch-mode flag. Returns { present:false } when absent (byte-
// identical behavior), { present:true, mode } when a valid literal, or { present:true, invalid:true,
// value } for a non-literal / newline-carrying value (the caller emits a typed refusal, no mutation).
function resolveCodexDispatchModeFlag(args) {
  const raw = args.codexDispatchMode;
  if (raw == null) return { present: false };
  const v = String(raw);
  if (/[\n\r]/.test(v) || CODEX_DISPATCH_MODES.indexOf(v) < 0) return { present: true, invalid: true, value: v };
  return { present: true, mode: v };
}

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
    // #395.5 (D1): OPT-IN exit gate. With --strict, cmdFinalize exits 4 when
    // closure_invariants.ok===false. DEFAULT (no flag) stays exit 0 so the contractor choreography
    // and ~5 existing test sites that read the JSON keep working. An UNCONDITIONAL nonzero exit on
    // ok:false would break that choreography and the walkthrough "must NOT abort finalize" assert.
    if (key === '--strict') { args.strict = true; continue; }
    // #333: keep-open partial-close archive — stamp-only (lane mechanics deferred to #336).
    if (key === '--keep-open') { args.keepOpen = true; continue; }
    // #336: --keep-issue-open is the design-specified cmdFinalize keep-open flag; the
    // implementation reuses args.keepOpen internally, so alias it here. Every prose surface
    // (contractor.md/.toml ×3, finalize.md/SKILL.md ×6, README, SKILL.md) dispatches
    // --keep-issue-open; without this alias it is an inert no-op on cmdFinalize and the
    // crash-resume keep-open path (live state archived, state-derivation unavailable) silently
    // close-modes — false-failed closure receipt + roadmap-source-absent invariant fire.
    if (key === '--keep-issue-open') { args.keepOpen = true; continue; }
    if (key === '--execute') { args.execute = true; continue; }
    if (key === '--archive') { args.archive = true; continue; }
    if (key === '--export')  { args.export = true; continue; }
    if (key === '--keep-branch') { args.keepBranch = true; continue; }
    // M1 (#280): planner self-attest flag; a boolean flag like --json/--force.
    if (key === '--attest-planner-spawn') { args.attestPlannerSpawn = true; continue; }
    // #338: contractor self-attest flag (mirror of --attest-planner-spawn) at the finalize seam.
    if (key === '--attest-contractor-spawn') { args.attestContractorSpawn = true; continue; }
    if (key.startsWith('--')) {
      const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (KNOWN_VALUE_FLAGS.has(name)) {
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
    // Capture malformed tokens so claimExplicitBundle can refuse with target_set_invalid_token
    // naming the offender, instead of claiming a wrong/partial set.
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

function ghExec(args, opts) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  // #356: cap every gh call at REMOTE_TIMEOUT_MS (caller opts may still override).
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
}

// #619: a fresh, UN-memoized live probe for post-close verification. probeIssueState (imported
// above) memoizes per-process — the pre-close probe below already primes that memo with the
// pre-close verdict, so reusing probeIssueState for a post-close re-check would always replay the
// STALE pre-close state, not a fresh one (breaking every genuine success, not just adding
// coverage). Mirrors sink-merge.js's own un-memoized probeIssueClosed. Any probe error degrades to
// false (never claim closed without live evidence).
function probeIssueClosedLive(issueNumber, opts) {
  if (OFFLINE || issueNumber == null) return false;
  try {
    const out = ghExec(['issue', 'view', String(issueNumber), '--json', 'state', '--jq', '.state'], opts);
    return String(out || '').trim().toLowerCase() === 'closed';
  } catch (_) { return false; }
}

// #427: idempotent gh issue close — probe-before-close prevents double-close; label removal
// is best-effort (ignore failure). Returns 'closed', 'already_closed', or 'failed'.
// #619: `gh issue close` exiting 0 is not proof the issue is actually closed on the forge (a flaky
// --comment post or a webhook race can leave it open) — post-probe LIVE on the success path too,
// not just in the catch branch, and bucket an open-after-exit-0 close as failed.
function closeIssueIdempotent(n, opts) {
  const probe = probeIssueState(n);
  if (probe.state === 'closed') return 'already_closed';
  if (probe.state === 'unavailable') return 'failed';
  try {
    ghExec(['issue', 'close', String(n), '--comment', 'Closed via finalize.'], opts);
    try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], opts); } catch (_) {}
    return probeIssueClosedLive(n, opts) ? 'closed' : 'failed';
  } catch (e) {
    return probeIssueClosedLive(n, opts) ? 'already_closed' : 'failed';
  }
}

// getCoordRoot and mainRootFromCoord are now imported from adaptiveSchema (#579 shared resolver).
// Their call sites below are byte-stable (same function names, same signatures).

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

// #356: a branch name beginning with '-' (or carrying a NUL) would be parsed by git as a flag,
// not a ref — guard it. execFileSync passes args without a shell so this is a parse-safety guard,
// not a shell-injection one, but it keeps a malformed/hostile state-file branch from reaching git.
function isSafeBranchArg(branch) {
  return typeof branch === 'string' && branch.length > 0 && !branch.startsWith('-') && !branch.includes('\0');
}

// #398.1: THROW-on-unsafe guard for branch CREATION sites. isSafeBranchArg (used by removeBranch)
// only guarded teardown; a hostile branch ('-evil', NUL, or one carrying a newline that would
// inject a state-file field) reached `git worktree add -b` / `git checkout -b` / patch-branch
// unguarded. assertSafeBranchArg refuses (typed throw) before the branch reaches git, so a
// malformed/hostile branch is never created or persisted. Newline/CR is rejected too (#398.2:
// a branch value with a newline would also inject a durable-state field).
function assertSafeBranchArg(branch, site) {
  if (!isSafeBranchArg(branch)) {
    throw new Error('refused: unsafe branch name' + (site ? ' at ' + site : '') +
      ': a branch beginning with "-" or carrying a NUL would be parsed by git as a flag/ref injection.');
  }
  assertNoNewline(branch, 'branch');
}

// #398.2: refuse a newline/CR in any durable-state field value. A value like
// `main\nworktree_path: /tmp/EVIL\nissue_numbers: 1,2,3` would inject FORGED lines into
// workflow-state.md (field() then returns the injected worktree_path; the project is
// reclassified as a 3-member bundle). Typed throw so the writer never persists the injection.
function assertNoNewline(value, fieldName) {
  if (typeof value === 'string' && /[\n\r]/.test(value)) {
    throw new Error('refused: ' + (fieldName || 'field') +
      ' contains a newline/CR — durable-state field injection. Provide a single-line value.');
  }
}

// #403.8: classify a raw worktree provisioning error into a stable, single-token class so a caller
// has a machine-readable signal (the raw `worktree_error` is a multi-line git message — useful for
// humans, useless for routing). Returns one of a small enum; '' when there's no error.
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
// permanently destroyed the ONLY copy of that work (the exact #617 data-loss end-state this tool
// exists to remedy, not reproduce). This is a DISTINCT, opt-in-safe helper — removeBranch() itself
// is left untouched because cmdRelease (a user-consented discard/abandon) legitimately still needs
// its unconditional force-delete semantics. Prove ancestry into the resolved default branch first;
// `-D` only on that proof. Otherwise fall back to the SAFE `git branch -d` (git itself refuses to
// delete a genuinely unmerged branch); on refusal, do NOT destroy anything — report
// `skipped_unmerged` with the branch's tip SHA so an operator can recover it manually.
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

function treeDirty(root, ownedProjects) {
  // #557: an UNPROBEABLE tree (held index.lock, EAGAIN/EMFILE, corrupt/detached repo) must fail CLOSED =
  // treated as DIRTY, mirroring the #496 assertWorktreeClean fix. The consumers (in-place feature-branch
  // gate, discard branch-delete) then REFUSE on an unverifiable tree rather than proceeding on a false
  // "clean". (Was catch → return false: the same "unverifiable → assume safe" fail-OPEN inversion #496
  // removed for the destructive worktree-remove path, left here on the non-destructive branch paths.)
  // KAOLA_WORKFLOW_FORCE_STATUS_FAIL=1 is a [TEST ONLY] seam to deterministically exercise the probe-fault path.
  // #579: parked-aware — kaola-workflow/<non-owned>/* and .kw/worktrees/<non-owned>/* are ignored so a
  // co-tenant lane's scratch files do not falsely dirty lane B's in-place gate. ownedProjects is [] when
  // unknown (fail-open on the parked side, fail-closed on unverifiable — unchanged).
  try {
    if (process.env.KAOLA_WORKFLOW_FORCE_STATUS_FAIL === '1') throw new Error('forced git status probe failure [TEST ONLY]');
    const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER }).trim();
    if (!status) return false;
    const owned = Array.isArray(ownedProjects) ? ownedProjects : [];
    return parsePorcelainPaths(status).some(p => !isParkedLanePath(p, owned));
  } catch (_) { return true; }
}

function defaultBranch(root) {
  // #397.3: probe chain (offline-safe). The single refs/remotes/origin/HEAD read is UNSET on a
  // clone-of-empty-bare or `git remote add` repo, so a master-default repo fell straight back to
  // 'main' → sink-merge then failed at `checkout main` (confusing, but fail-closed). Try the local
  // symbolic-ref first (no network), then `git remote show` and `ls-remote --symref` (network, may
  // be unavailable offline — swallowed), then default to 'main'. The first probe that resolves wins.
  // 1) Local symbolic-ref (no network).
  try {
    const ref = execFileSync('git', ['-C', root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (ref) return ref.replace(/^origin\//, '');
  } catch (_) {}
  // Offline: never make a network probe — fall straight to the default.
  if (OFFLINE) return 'main';
  // 2) `git remote show origin` → "HEAD branch: <name>" (network).
  try {
    const out = execFileSync('git', ['-C', root, 'remote', 'show', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: REMOTE_TIMEOUT_MS });
    const m = out.match(/^\s*HEAD branch:\s*(\S+)\s*$/m);
    if (m && m[1] && m[1] !== '(unknown)') return m[1];
  } catch (_) {}
  // 3) `git ls-remote --symref origin HEAD` → "ref: refs/heads/<name>\tHEAD" (network).
  try {
    const out = execFileSync('git', ['-C', root, 'ls-remote', '--symref', 'origin', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: REMOTE_TIMEOUT_MS });
    const m = out.match(/^ref:\s*refs\/heads\/(\S+)\s+HEAD\s*$/m);
    if (m && m[1]) return m[1];
  } catch (_) {}
  return 'main';
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
  // #398.1: guard the branch BEFORE `git worktree add -b <branch>` — a '-evil'/NUL branch
  // would otherwise be parsed by git as a flag and persisted into workflow-state.md.
  assertSafeBranchArg(branch, 'provisionWorktree');
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
  // #353: crash-safe atomic replace (tmp + fsync + rename) for durable-state writes — a torn
  // workflow-state.md is silently skipped by readActiveFolders (project goes invisible), so the
  // write must be all-or-nothing. Falls back to a plain write only if the helper is unavailable.
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

// Capture claim identity and immutable Git root exactly once. The returned
// scalar fields are persisted in workflow-state.md; the typed payloads remain
// available to tests/replan callers but are not serialized as ad-hoc JSON.
function buildClaimAnchors(root, data) {
  const anchorRoot = fs.realpathSync(data.worktree_path || root);
  let objectFormat = '';
  try {
    objectFormat = execFileSync('git', ['-C', anchorRoot, 'rev-parse', '--show-object-format'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim().toLowerCase();
  } catch (_) {}
  if (!objectFormat) objectFormat = 'sha1';
  const objectLength = objectFormat === 'sha256' ? 64 : 40;
  let commit;
  let tree;
  try {
    // The claim root binds the immutable candidate observed at claim time.  Its
    // branch field is the target identity, not a requirement that HEAD already
    // be checked out on that future feature branch.
    if (hasGitHistory(anchorRoot)) {
      commit = execFileSync('git', ['-C', anchorRoot, 'rev-parse', 'HEAD'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      }).trim().toLowerCase();
      tree = execFileSync('git', ['-C', anchorRoot, 'rev-parse', 'HEAD^{tree}'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      }).trim().toLowerCase();
    } else {
      // An initialized repository with no commits still has a canonical root:
      // the all-zero commit sentinel plus Git's canonical empty-tree object.
      execFileSync('git', ['-C', anchorRoot, 'rev-parse', '--git-dir'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      });
      commit = '0'.repeat(objectLength);
      tree = execFileSync('git', ['-C', anchorRoot, 'hash-object', '-t', 'tree', '--stdin'], {
        input: '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
      }).trim().toLowerCase();
    }
  } catch (_) {
    throw new Error('claim_root_unavailable');
  }
  const issues = Array.isArray(data.issue_numbers) && data.issue_numbers.length
    ? data.issue_numbers : [data.issue_number];
  const identity = adaptiveSchema.buildClaimIdentity({
    schema_version: adaptiveSchema.EPOCH_SCHEMA_VERSION,
    repository_id: repositoryIdentity(anchorRoot),
    issue_numbers: issues,
    primary_issue: data.issue_number,
    bundle_id: data.bundle_id || null,
    closure_policy: data.closure_policy || 'all_or_nothing',
    branch: data.branch,
    worktree_path: anchorRoot,
    claim_ts: data.claim_ts,
    session_marker: data.session_marker,
  });
  const rootBase = adaptiveSchema.buildClaimRootBase({
    schema_version: adaptiveSchema.EPOCH_SCHEMA_VERSION,
    object_format: objectFormat,
    commit,
    tree,
    branch: data.branch,
  });
  const lineage = adaptiveSchema.buildEpochLineage(identity, rootBase);
  return {
    epoch_schema_version: adaptiveSchema.EPOCH_SCHEMA_VERSION,
    claim_repository_id: identity.repository_id,
    claim_identity_digest: lineage.claim_identity_digest,
    claim_root_object_format: rootBase.object_format,
    claim_root_base_commit: rootBase.commit,
    claim_root_base_tree: rootBase.tree,
    claim_root_base_digest: lineage.claim_root_base_digest,
    epoch_lineage_id: lineage.epoch_lineage_id,
    plan_epoch: 1,
    active_plan_hash: 'none',
    inherited_frontier_digest: 'none',
    inherited_frontier_classes: 'none',
    automatic_review_replans: 0,
    authorized_epoch_ceiling: adaptiveSchema.REVIEW_REPLAN_LIMIT,
    case_b_exemption_consumed: false,
    replan_status: 'none',
    replan_transaction_id: 'none',
    replan_phase: 'none',
    active_snapshot_manifest_digest: 'none',
    claim_identity: identity,
    claim_root_base: rootBase,
  };
}

function writeState(root, data) {
  // #398.2: refuse a newline/CR in any durable field value BEFORE serializing the state. A value
  // carrying a newline would inject FORGED lines into workflow-state.md (e.g. a forged worktree_path
  // or issue_numbers that reclassifies the project as a bundle). Guard the operator/state-derived
  // string fields; numeric fields (issue_number, pr_number) and the array (issue_numbers) cannot
  // carry a newline once joined.
  assertNoNewline(data.branch, 'branch');
  assertNoNewline(data.worktree_path, 'worktree_path');
  assertNoNewline(data.base_branch, 'base_branch');
  assertNoNewline(data.pr_url, 'pr_url');
  // #603: same anti-injection guard as worktree_path for the persisted Codex dispatch mode (the
  // literal-value validation happens upstream at cmdStartup; this is the durable-field newline fence).
  assertNoNewline(data.codex_dispatch_mode, 'codex_dispatch_mode');
  // #579: liveness-marker guard — main_root is resolved here (not passed in); refuse before
  // serialization if the resolved path contains a newline (malicious cwd injection).
  const computedMainRoot = resolveMainRoot(root);
  assertNoNewline(computedMainRoot, 'main_root');
  // Direct crash-reclaim callers historically name only the canonical
  // `issue-N` project.  Preserve their no-probe behavior while making the new
  // schema-2 durable identity complete and reconstructible.
  if (data.issue_number == null) {
    const inferredIssue = /^issue-([1-9][0-9]*)$/.exec(String(data.project || ''));
    if (inferredIssue) data.issue_number = parseInt(inferredIssue[1], 10);
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
    'runtime: ' + (data.runtime || resolveRuntime({}, process.env)),
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
    '## Planning Evidence',
    'plan_hash: none',
    'decision: none',
    'risk: none',
    'first_node_id: none',
    'first_node_role: none',
    '',
    '## Last Updated',
    new Date().toISOString(),
    '',
    '## Sink',
    'branch: ' + data.branch,
    'issue_number: ' + (data.issue_number || ''),
    'sink: ' + (data.sink || 'merge'),
    'run_posture: ' + deriveRunPosture(data.worktree_path),
    // #579 liveness-marker fields — written at claim-time; read by adaptive-node.js (main_root)
    // and classifyLane (session_marker + claim_ts). Field names are chosen to avoid the names
    // stripped by removeLegacyStateBlocks (the retired session-lease fields) and the retired
    // block heading; see n1-design.md RISK 1 for the exact exclusion list.
    'main_root: ' + computedMainRoot,
    'session_marker: ' + sessionMarker,
    'claim_ts: ' + claimTs
  ];
  if (data.worktree_path) lines.push('worktree_path: ' + data.worktree_path);
  // #603: persist the Codex dispatch mode so the adaptive dispatch cards read it at open time. Written
  // ONLY when present (flag absent → field absent → dispatch keeps the v1-thread-id fail-closed default,
  // so non-codex editions and un-flagged runs are byte-identical to today).
  if (data.codex_dispatch_mode) lines.push('codex_dispatch_mode: ' + data.codex_dispatch_mode);
  if (data.worktree_error) {
    // #403.8: a raw git worktree error is multi-line — collapsing it to a single line keeps it a
    // safe single durable field (a newline would otherwise inject a forged field, the #398.2 class).
    // The classified token (worktree_error_class) is the machine-readable signal alongside it.
    lines.push('worktree_error: ' + String(data.worktree_error).replace(/[\r\n]+/g, ' ').trim());
    const wec = data.worktree_error_class || classifyWorktreeError(data.worktree_error);
    if (wec) lines.push('worktree_error_class: ' + wec);
  }
  if (data.base_branch) lines.push('base_branch: ' + data.base_branch);
  if (data.pr_url) lines.push('pr_url: ' + data.pr_url);
  if (data.pr_number) lines.push('pr_number: ' + data.pr_number);
  // #328: bundle-only additive fields — ONLY written when present (single-issue path stays byte-identical)
  // #393a: emit issue_numbers ONLY for a TRUE bundle (length > 1). A 1-element "bundle" would emit a
  // misleading issue_numbers line that sink-merge's deriveMemberSet then reads back — harmless (the
  // close-loop gates on >1) but a needless single-issue divergence. length>1 keeps the single-issue
  // (and degenerate 1-element) output byte-identical to a plain claim.
  if (Array.isArray(data.issue_numbers) && data.issue_numbers.length > 1) {
    lines.push('issue_numbers: ' + data.issue_numbers.join(','));
    lines.push('bundle_id: ' + data.bundle_id);
    lines.push('closure_policy: ' + (data.closure_policy || 'all_or_nothing'));
  }
  let stateContent = lines.join('\n') + '\n';
  stateContent = adaptiveSchema.writeEpochStateBlock(stateContent, claimAnchors);
  writeFile(stateFile(root, data.project), stateContent);
}

function updateState(root, project, updater) {
  const file = stateFile(root, project);
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) {}
  const updated = updater(content);
  writeFile(file, updated);
}

function postAdvisoryClaim(issueNumber, project) {
  // #356: return a truthful status so a claim with ZERO remote footprint is visible (the prior
  // void return silently swallowed every failure → cross-machine claim detection was defeated with
  // no warning). 'posted' = the in-progress label landed (the load-bearing detection footprint);
  // 'failed' = it did not; 'skipped_offline' = offline.
  if (OFFLINE || issueNumber == null) return 'skipped_offline';
  let labelAdded = false;
  try { ghExec(['label', 'create', CLAIM_LABEL, '--color', 'f9d0c4', '--description', 'Kaola-Workflow active work marker']); } catch (_) {}
  try { ghExec(['issue', 'edit', String(issueNumber), '--add-label', CLAIM_LABEL]); labelAdded = true; } catch (_) {}
  try { ghExec(['issue', 'comment', String(issueNumber), '--body', '<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local work for `' + project + '`.']); } catch (_) {}
  return labelAdded ? 'posted' : 'failed';
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

// #495: classifier error classification helper — separates transient (retry-eligible) faults
// from determinate clean-nonzero exits. Returns an error-class string:
//   'spawn_fault'  — subprocess couldn't spawn (ENOENT/EAGAIN/EMFILE/ENOMEM, no e.status)
//   'killed'       — subprocess was killed or timed out (e.killed===true or e.signal present)
//   'clean_nonzero' — subprocess ran and exited non-zero (e.status present, not status===2)
function classifySubprocessError(e) {
  if (e.status === 2) return 'owned_exit'; // handled separately by caller
  if (e.status != null) return 'clean_nonzero';
  if (e.killed === true || e.signal) return 'killed';
  if (e.code && ['ENOENT', 'EAGAIN', 'EMFILE', 'ENOMEM'].indexOf(e.code) !== -1) return 'spawn_fault';
  return 'killed'; // unknown non-status fault — treat as transient
}

// #519: AXIS REPLACEMENT (mirror of classifier.isTransientFetchStderr) — KNOWN transient-infra
// stderr signatures. A clean_nonzero subprocess exit whose captured stderr/stdout carries one of
// these is treated as TRANSIENT (retry + escalate), not a determinate refuse. Kept byte-aligned
// with the classifier copy so the four sites converge on the same verdict for the same fault.
const TRANSIENT_FETCH_STDERR = [
  /\bTLS\b/i,
  /handshake/i,
  /\btimed?\s*out\b/i,
  /\bETIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /connection reset/i,
  /connection refused/i,
  /\bECONNREFUSED\b/i,
  /rate limit/i,
  /\b429\b/,
  /could not resolve host/i,
  /\bEAI_AGAIN\b/i,
  /temporary failure in name resolution/i,
  /\bdial tcp\b/i,
  /\b5\d\d\b\s*(?:internal|bad gateway|service unavailable|gateway timeout)?/i,
  /internal server error/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway time-?out/i,
  /\bi\/o timeout\b/i,
  /network is unreachable/i,
  /\bEHOSTUNREACH\b/i,
];

// #519: true iff captured stderr/stdout carries a KNOWN transient-infra signature.
function isTransientFetchStderr(text) {
  const s = String(text || '');
  if (!s) return false;
  return TRANSIENT_FETCH_STDERR.some(re => re.test(s));
}

// #495: classifier retry timeout — overridable for tests so three 30s hangs don't block the suite.
function classifierTimeoutMs() {
  const v = parseInt(process.env.KAOLA_CLASSIFIER_TIMEOUT_MS || '', 10);
  return (Number.isFinite(v) && v > 0) ? v : 30000;
}

// #495: synchronous sleep for retry backoff (Atomics.wait on a shared buffer — safe in sync path).
function syncSleepMs(ms) {
  if (ms <= 0) return;
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {}
}

function classifyIssue(root, issueNumber) {
  // #495: KAOLA_CLASSIFIER_MOCK_SCRIPT — test seam mirroring KAOLA_GH_MOCK_SCRIPT precedent.
  // When set, the mock script is invoked instead of the real classifier, so tests can drive
  // the REAL execFileSync retry path with a controllable mock (crash/kill/clean-nonzero/green).
  const classifierMock = process.env.KAOLA_CLASSIFIER_MOCK_SCRIPT;
  const classifier = classifierMock || path.join(__dirname, 'kaola-workflow-classifier.js');
  if (!classifierMock && !fs.existsSync(classifier)) return { verdict: 'target_unavailable', reasoning: 'classifier unavailable (packaging error)' };

  const MAX_ATTEMPTS = 3; // ≤3 total (1 original + up to 2 retries)
  // #495: small default backoff between retries — gives transient resource faults (EMFILE/EAGAIN)
  // a moment to clear. Tests can set KAOLA_CLASSIFIER_BACKOFF_MS=0 to keep the suite fast.
  const BACKOFF_MS_DEFAULT = 50;
  const BACKOFF_MS = parseInt(process.env.KAOLA_CLASSIFIER_BACKOFF_MS || String(BACKOFF_MS_DEFAULT), 10);
  const backoffMs = (Number.isFinite(BACKOFF_MS) && BACKOFF_MS >= 0) ? BACKOFF_MS : BACKOFF_MS_DEFAULT;
  let lastErr = null;
  let lastErrClass = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) syncSleepMs(backoffMs);
    try {
      const raw = execFileSync(process.execPath, [classifier, 'classify', '--issue', String(issueNumber), '--json'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: classifierTimeoutMs(),
        // #362: hand the parent's issue-state snapshot to the classifier subprocess so it reuses
        // what the parent already probed (active-folders seeds its memo from this env) instead of
        // re-probing the same issue. Additive; an empty/malformed snapshot is ignored downstream.
        env: Object.assign({}, process.env, { KAOLA_ISSUE_STATE_SNAPSHOT: JSON.stringify(getIssueStateSnapshot()) })
      }).trim();
      return raw ? JSON.parse(raw) : { verdict: 'target_unavailable', reasoning: 'classifier returned empty output (contract bug)' };
    } catch (e) {
      if (e.status === 2) return { verdict: 'owned', reasoning: 'active local folder already exists' };
      lastErr = e;
      lastErrClass = classifySubprocessError(e);
      // #495/#519: transient classes (spawn_fault, killed) are retried; a clean non-zero exit is
      // determinate ONLY when its stderr does NOT carry a transient-infra signature. A clean_nonzero
      // whose stderr is a TLS timeout / rate-limit / DNS fault (the axis change) is transient → retry.
      if (lastErrClass === 'clean_nonzero') {
        const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
        if (!isTransientFetchStderr(combined)) break; // genuine / unrecognized → determinate, do not retry
        // transient-infra stderr on a clean_nonzero exit → fall through to retry
      }
      // transient: loop for next attempt (up to MAX_ATTEMPTS total)
    }
  }

  // Retry exhausted (or clean_nonzero broke early). Classify the final outcome.
  // #519: a clean_nonzero is determinate-refuse ONLY when its stderr carries NO transient signature;
  // a transient-infra clean_nonzero falls through to the indeterminate/escalate emitter below.
  if (lastErrClass === 'clean_nonzero' &&
      !isTransientFetchStderr(String((lastErr && lastErr.stderr) || '') + '\n' + String((lastErr && lastErr.stdout) || ''))) {
    // Determinate: subprocess ran and exited non-zero. Capture truncated stderr.
    const stderrSnip = String((lastErr && lastErr.stderr) || '').slice(0, 200).trim();
    return {
      verdict: 'target_unavailable',
      reasoning: 'classifier exited non-zero' + (stderrSnip ? ': ' + stderrSnip : ' (no stderr)')
    };
  }
  // Transient failure persisted after retry — emit the new indeterminate verdict (#495).
  const errCode = (lastErr && lastErr.code) || '';
  const signal = (lastErr && lastErr.signal) || '';
  return {
    verdict: 'indeterminate',
    reasoning_class: 'classifier_error',
    reasoning: 'classifier subprocess fault after ' + MAX_ATTEMPTS + ' attempts' +
      (errCode ? ' (code=' + errCode + ')' : '') +
      (signal ? ' (signal=' + signal + ')' : '')
  };
}

function activeByIssue(root, issueNumber) {
  // #328: bundle-aware — also checks issue_numbers array for bundle membership
  return readActiveFolders(root).find(folder =>
    folder.issue_number === issueNumber ||
    (Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(issueNumber))
  ) || null;
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

  // issue #538: the single path-legality gate for NEW claims (covers cmdClaim and
  // cmdStartup -> claimExplicitTarget). Adaptive is the unconditional default and is
  // ALWAYS legal; fast/full are legal ONLY when installed (install-time opt-in via
  // --with-fast/--with-full -> `installed_paths` in config). A KAOLA_PATH/--workflow-path
  // naming a non-installed path is a TYPED `path_not_installed` refusal (#44/#538) — never
  // a silent substitution to adaptive, never a crash. Resume of an already-frozen plan does
  // NOT pass here (the `existing` early-return above handles re-claims), so this gates
  // SELECTION only.
  const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'adaptive';
  const installedPaths = adaptiveSchema.resolveInstalledPaths(readAdaptiveConfig());
  if (!adaptiveSchema.isLegalWorkflowPath(requestedPath, installedPaths)) {
    const legal = [adaptiveSchema.ADAPTIVE_PATH, ...installedPaths].join(', ');
    return {
      status: 'path_not_installed',
      result: 'refuse',
      claim: 'none',
      issue: issueNumber,
      project,
      reasoning: 'workflow_path "' + requestedPath + '" is not installed. Installed paths: ' + legal +
        ' (adaptive is always available). Re-run install with --with-fast / --with-full to add it. ' +
        'Refusing to silently substitute adaptive (#538/#44).'
    };
  }

  if (issueNumber != null) {
    const probe = probeIssueState(issueNumber);
    if (probe.state === 'closed') {
      return { status: 'user_target_closed', issue: issueNumber, project, reasoning: 'GitHub issue #' + issueNumber + ' is closed' };
    }
    // #519: a TRANSIENT-infra probe fault escalates (the operator/orchestrator can retry) instead of
    // refusing — a TLS timeout / rate-limit / DNS blip must not be read as "target unavailable".
    if (!OFFLINE && probe.state === 'unavailable' && probe.transient === true) {
      return { status: 'target_indeterminate', result: 'escalate', claim: 'none', issue: issueNumber, project,
        reasoning_class: 'classifier_error',
        reasoning: 'gh issue #' + issueNumber + ' state probe transient fault (' + (probe.reason || 'transient') + '); escalate to retry' };
    }
    if (!OFFLINE && probe.state === 'unavailable') {
      return { status: 'target_unavailable', claim: 'none', issue: issueNumber, project, reasoning: 'gh issue #' + issueNumber + ' state probe failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' };
    }
  }

  // Hoist branch name computation before mkdir so the dirty-tree gate and in-place checkout block
  // can reference it without orphaning a created folder on refusal.
  const branch = buildBranchName(issueNumber, project, args.branch);
  // #398.1: guard the resolved branch at the front door — BEFORE mkdir, worktree provision, and the
  // in-place `git checkout -b`. A hostile `--branch -evil` (or a newline-bearing value) is refused
  // here with ZERO mutation, so it never reaches git or workflow-state.md.
  assertSafeBranchArg(branch, 'claimProject');

  // Dirty-tree gate: refuse in-place branch creation if the working tree has uncommitted changes.
  // Fires ONLY when NATIVE=0 (in-place mode), online, with git history, and HEAD not detached.
  // Detached HEAD is NOT refused here — it falls to record-only below.
  const headBranch = inPlaceHead(root);
  const wouldInPlace = !OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE;
  if (wouldInPlace && headBranch !== 'HEAD' && headBranch !== '' && treeDirty(root, [project])) {
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
  const worktreeBranchExisted = branchExists(root, branch);
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

  try {
    writeState(root, {
      project,
      issue_number: issueNumber,
      branch,
      sink: args.sink || process.env.KAOLA_SINK || 'merge',
      worktree_path: worktreePath,
      worktree_error: worktreeError,
      base_branch: baseBranch,
      workflow_path: args.workflowPath || process.env.KAOLA_PATH || 'adaptive',
      runtime: resolveRuntime(args, process.env),
      // #603: thread the pre-validated Codex dispatch mode into durable state (undefined when the flag
      // was absent → writeState omits the field).
      codex_dispatch_mode: args.codexDispatchMode,
      status: 'active'
    });
  } catch (error) {
    const rollbackWorktree = worktreePath || worktreePathFor(root, project);
    if (fs.existsSync(rollbackWorktree)) removeWorktree(root, project, { worktree_path: rollbackWorktree });
    if (!worktreeBranchExisted && branchExists(root, branch)) removeBranch(root, branch);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    throw error;
  }
  const remoteClaim = postAdvisoryClaim(issueNumber, project); // #356: surface the real footprint status
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
    { status: 'acquired', verdict: 'green', claim: 'acquired', issue: issueNumber, project, branch, worktree_path: worktreePath, remote_claim: remoteClaim },
    // #403.8: surface the classified worktree-error token alongside the raw message so a caller has a
    // machine-readable signal instead of having to parse a raw git error string.
    worktreeError ? { worktree_error: worktreeError, worktree_error_class: classifyWorktreeError(worktreeError) } : {},
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
    return { status: 'target_unavailable', result: 'refuse', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
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
  // #495: indeterminate verdict — transient classifier fault after retry exhausted → escalate.
  if (classified.verdict === 'indeterminate') {
    return {
      status: 'target_indeterminate',
      result: 'escalate',
      claim: 'none',
      issue: targetIssue,
      project: projectNameForIssue(root, targetIssue),
      reasoning_class: classified.reasoning_class || 'classifier_error',
      reasoning: classified.reasoning
    };
  }
  return claimProject(root, Object.assign({}, args, { issue: targetIssue, project: args.project || projectNameForIssue(root, targetIssue) }));
}

// #328: bundle-specific hard add-label. Unlike postAdvisoryClaim (which swallows all gh errors
// to be fire-and-forget), this helper THROWS on add-label failure so the claimBundle catch block
// can drive the all-or-nothing rollback. label create is still fire-and-forget (best-effort).
// The issue comment is also best-effort (after the hard label succeeds).
function addBundleLabel(issueNumber, project) {
  if (OFFLINE || issueNumber == null) return;
  try { ghExec(['label', 'create', CLAIM_LABEL, '--color', 'f9d0c4', '--description', 'Kaola-Workflow active work marker']); } catch (_) {}
  // Hard add-label: throws on failure — allows the claimBundle catch to drive rollback.
  ghExec(['issue', 'edit', String(issueNumber), '--add-label', CLAIM_LABEL]);
  // Best-effort comment (never throws — rollback already can't undo a comment so
  // a hard throw here adds no correctness value and would orphan a REAL label).
  try { ghExec(['issue', 'comment', String(issueNumber), '--body', '<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local work for `' + project + '`.']); } catch (_) {}
}

// #328: bundle-specific hard remove-label for the rollback path. THROWS on remove-label failure
// so the claimBundle rollback loop can detect when teardown itself fails and return
// target_set_label_rollback_failed (rather than silently masking the teardown error).
// Unlike clearAdvisoryClaim (which swallows all errors), this propagates the gh error.
// The best-effort comment + marker deletion are still fire-and-forget.
function removeBundleLabel(issueNumber, project) {
  if (OFFLINE || issueNumber == null) return;
  // Hard remove-label: throws on failure so the rollback loop sets rollbackOk=false.
  ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]);
  // Best-effort: comment + delete the kw:claim marker comment (same as clearAdvisoryClaim).
  try { ghExec(['issue', 'comment', String(issueNumber), '--body', 'Kaola-Workflow advisory claim cleared: bundle claim rolled back']); } catch (_) {}
  try {
    const raw = ghExec(['api', 'repos/{owner}/{repo}/issues/' + String(issueNumber) + '/comments']);
    const comments = JSON.parse(raw || '[]');
    const marker = '<!-- kw:claim project=' + project + ' -->';
    for (const comment of comments) {
      if (!comment || !comment.body || !comment.id) continue;
      if (comment.body.includes(marker)) {
        try { ghExec(['api', '--method', 'DELETE', 'repos/{owner}/{repo}/issues/comments/' + String(comment.id)]); } catch (_) {}
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
  // #398.1: guard the bundle branch BEFORE any provisioning (worktree add / in-place checkout -b).
  assertSafeBranchArg(branch, 'claimBundle');
  // applied: track what was provisioned so rollback can undo exactly what succeeded
  const applied = { dir: false, worktree: false, worktreeAttempted: false, worktreePath: '', worktreeBranchExisted: false,
    labeled: [], inPlaceBranch: false, baseBranch: '' };

  // #370: bundle runs now get the SAME provisioning hardening as single-issue claimProject.
  // Dirty-tree gate (NATIVE=0 in-place mode): refuse BEFORE any mutation so a dirty tree never
  // orphans a created folder. Mirrors claimProject's gate.
  const headBranch = inPlaceHead(root);
  const wouldInPlace = !OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE;
  if (wouldInPlace && headBranch !== 'HEAD' && headBranch !== '' && treeDirty(root, [project])) {
    return { status: 'dirty_tree_refused', claim: 'none', issue: targets[0], issue_numbers: targets, project,
      reasoning: 'working tree has uncommitted changes; refusing to create the in-place bundle feature branch (KAOLA_WORKTREE_NATIVE=0). Commit or stash, or use a worktree.' };
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
        return { status: 'target_set_conflicts_active_work', issue: targets[0], project,
          reasoning: 'bundle project folder already exists: ' + project };
      } else if (e.code !== 'EEXIST') { throw e; }
    }
    applied.dir = true;

    // Step 3 (#370): provision a worktree exactly like claimProject. The prior "matches adaptive
    // single-issue" rationale was FALSE — claimProject provisions a worktree for ALL paths INCLUDING
    // adaptive (#264). Bundle runs now get the same hardening; run_posture derives from the result
    // (writeState). Track in `applied` so rollback removes it.
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

    // In-place branch creation (NATIVE=0 + online + git history): create/checkout the bundle feature
    // branch and record base_branch so cmdRelease's #260 restore can run. The prior bundle path
    // recorded `branch` in state but NEVER created it, so cmdRelease's restore was a no-op.
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
          applied.inPlaceBranch = !existedBefore; // only delete on rollback what we created
          applied.baseBranch = baseBranch;
        } catch (e) {
          inPlaceNote = 'in-place branch checkout failed: ' + ((e && e.message) || String(e));
        }
      }
    }

    // Step 4: writeState with primary + bundle fields (base_branch added per #370; writeState
    // derives run_posture from worktree_path).
    writeState(root, {
      project,
      issue_number: targets[0],
      issue_numbers: targets,
      bundle_id: project,
      closure_policy: 'all_or_nothing',
      branch,
      sink: opts.sink || 'merge',
      worktree_path: worktreePath,
      worktree_error: worktreeError,
      base_branch: baseBranch,
      workflow_path: 'adaptive',
      runtime: resolveRuntime(opts, process.env),
      // #603: thread the pre-validated Codex dispatch mode (bundle path mirrors the scalar claim).
      codex_dispatch_mode: opts.codexDispatchMode,
      status: 'active'
    });

    // #370: planner self-attest back-fill on the bundle path (mirror of claimProject's #280 block).
    // The dispatch-log hook cannot log the planner's own claim (it CREATES the .cache). Gated on the
    // flag; warn-first (never blocks the claim).
    if (opts.attestPlannerSpawn) {
      try {
        const cacheDir = path.join(root, 'kaola-workflow', project, '.cache');
        fs.mkdirSync(cacheDir, { recursive: true });
        const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        const entry = JSON.stringify({ ts, agent_type: 'workflow-planner', agent_id: 'claim-backfill', cwd: root });
        fs.appendFileSync(path.join(cacheDir, 'dispatch-log.jsonl'), entry + '\n');
      } catch (_) { /* fail-open: attestation is warn-first */ }
    }

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
      return {
        status: 'target_set_label_rollback_failed',
        issue_numbers: targets,
        project,
        reasoning: 'partial claim could not be fully rolled back; manual cleanup may be required',
        partial: applied
      };
    }
    return {
      status: 'target_set_unavailable',
      issue_numbers: targets,
      project,
      reasoning: 'bundle provision failed and was rolled back: ' + ((claimErr && claimErr.message) || String(claimErr))
    };
  }
}

// #328: the bundle analog of claimExplicitTarget — validates every member (steps 1-4 from design.md)
// before any mutation, then delegates provisioning to claimBundle (step 5-6).
// KAOLA_BUNDLE_MAX_ISSUES default 4; bundle lane is adaptive-only.
function claimExplicitBundle(root, args) {
  const targets = args.targetIssues;
  // Step 0 (#370): refuse malformed tokens (echo the offender) BEFORE the empty check, so
  // `--target-issues 42,4x,53` and `--target-issues abc` fail loudly instead of silently
  // claiming a coerced/partial set or falling through to no_target.
  if (Array.isArray(args.targetIssuesInvalidTokens) && args.targetIssuesInvalidTokens.length) {
    return { status: 'target_set_invalid_token', claim: 'none', project: null, issue: null,
      reasoning: '--target-issues contains invalid token(s): ' + args.targetIssuesInvalidTokens.join(', ') +
        ' — each target must be a positive integer' };
  }
  // Step 1: empty/missing
  if (!Array.isArray(targets) || targets.length === 0) {
    return { status: 'target_set_empty', claim: 'none', project: null, issue: null,
      reasoning: '--target-issues <A,B,...> required' };
  }
  // Step 2: cap. #370: KAOLA_BUNDLE_MAX_ISSUES (default 4) is clamped to a documented HARD ceiling
  // so a runaway env value cannot claim an unbounded bundle.
  const BUNDLE_HARD_CEILING = 10;
  const maxRaw = parseInt(process.env.KAOLA_BUNDLE_MAX_ISSUES || '4', 10);
  const max = Math.min((Number.isFinite(maxRaw) && maxRaw > 0) ? maxRaw : 4, BUNDLE_HARD_CEILING);
  if (targets.length > max) {
    return { status: 'target_set_too_large', claim: 'none', project: null, issue: null,
      reasoning: 'bundle of ' + targets.length + ' exceeds KAOLA_BUNDLE_MAX_ISSUES=' + max };
  }
  // Step 3: bundle lane is adaptive-only (fast/full have no multi-issue lane). #538: this is
  // a lane constraint, not an installed-path legality question — adaptive is always legal, so the
  // only refusal here is "this lane only accepts adaptive."
  const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'adaptive';
  if (requestedPath !== adaptiveSchema.ADAPTIVE_PATH) {
    return { status: 'bundle_requires_adaptive', result: 'refuse', claim: 'none', project: null, issue: null,
      reasoning: 'the bundle lane is adaptive-only; got workflow_path "' + requestedPath + '"' };
  }
  // Step 4: per-issue validation loop (NO mutation yet)
  for (const n of targets) {
    // 4a: check active folders (bundle-aware activeByIssue)
    const existing = activeByIssue(root, n);
    if (existing) {
      return { status: 'target_set_conflicts_active_work', result: 'refuse', claim: 'none', issue: n,
        reasoning: '#' + n + ' is already claimed by project ' + existing.project };
    }
    // 4b: probe issue state FIRST so a closed member gets the dedicated code before
    //     the classifier (which returns verdict:'red' for closed issues, causing it to
    //     be unreachable if probe runs after classify).
    const probe = probeIssueState(n);
    if (probe.state === 'closed') {
      return { status: 'target_set_has_closed_issue', result: 'refuse', claim: 'none', issue: n,
        reasoning: '#' + n + ' is closed' };
    }
    // #519: a TRANSIENT-infra probe fault escalates the whole bundle (reach the existing
    // target_set_indeterminate/escalate valve) instead of refusing on a TLS timeout / rate-limit / DNS blip.
    if (!OFFLINE && probe.state === 'unavailable' && probe.transient === true) {
      return { status: 'target_set_indeterminate', result: 'escalate', claim: 'none', issue: n,
        reasoning_class: 'classifier_error',
        reasoning: '#' + n + ' state probe transient fault (' + (probe.reason || 'transient') + '); escalate to retry' };
    }
    if (!OFFLINE && probe.state === 'unavailable') {
      return { status: 'target_set_unavailable', result: 'refuse', claim: 'none', issue: n,
        reasoning: '#' + n + ' state probe failed' };
    }
    // 4c: classify
    const classified = classifyIssue(root, n);
    if (classified.verdict === 'owned' || classified.verdict === 'blocked') {
      return { status: 'target_set_conflicts_active_work', result: 'refuse', claim: 'none', issue: n,
        reasoning: classified.reasoning };
    }
    if (classified.verdict === 'red') {
      return { status: 'target_set_red', result: 'refuse', claim: 'none', issue: n, reasoning: classified.reasoning };
    }
    if (classified.verdict === 'target_unavailable') {
      return { status: 'target_set_unavailable', result: 'refuse', claim: 'none', issue: n, reasoning: classified.reasoning };
    }
    if (classified.verdict === 'target_unverified') {
      return { status: 'target_set_unverified', claim: 'none', issue: n, reasoning: classified.reasoning };
    }
    // #495: indeterminate verdict — transient classifier fault after retry exhausted → escalate.
    if (classified.verdict === 'indeterminate') {
      return {
        status: 'target_set_indeterminate',
        result: 'escalate',
        claim: 'none',
        issue: n,
        reasoning_class: classified.reasoning_class || 'classifier_error',
        reasoning: classified.reasoning
      };
    }
  }
  // Step 5: derive project/branch — design §Naming: bundle_id = 'bundle-' + sorted targets
  const project = 'bundle-' + targets.join('-');
  const branch = buildBranchName(null, project, args.branch);
  // Step 5-6: all-or-nothing provision
  return claimBundle(root, {
    targets,
    project,
    branch,
    sink: args.sink || process.env.KAOLA_SINK || 'merge',
    runtime: resolveRuntime(args, process.env),
    attestPlannerSpawn: args.attestPlannerSpawn // #370: honor the planner attest back-fill on the bundle path
  });
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

// issue #235 (audit D8): the /kaola-workflow-adapt AUTHORING entry. The adapt command calls this
// BEFORE authoring/freezing a workflow-plan.md to keep the mechanical gate's shape. #538: adaptive
// is the unconditional default — there is no switch to be OFF — so authoring is ALWAYS allowed; the
// subcommand stays registered and returns the allow envelope, it simply never refuses. Forge-neutral
// + stateless (no gh/glab, no issue field, no folder requirement) so the body is byte-identical
// across all four editions. The VALIDATOR stays toggle-agnostic.
function cmdAuthoringAllowed() {
  const args = parseArgs(process.argv.slice(3));
  output({ status: 'authoring_allowed', allowed: true, project: args.project || null });
}

function cmdStartup() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const scalarTarget = args.targetIssue || args.issue;
  const bundleTargets = Array.isArray(args.targetIssues) && args.targetIssues.length ? args.targetIssues : null;

  // #328: target_ambiguity — both scalar and bundle set
  if (scalarTarget && bundleTargets) {
    output({ verdict: 'target_ambiguity', claim: 'none', project: null, issue: null,
      status: 'target_ambiguity',
      reasoning: 'both --target-issue and --target-issues set; choose one' }, 1);
    return;
  }

  // #603: value-validate --codex-dispatch-mode BEFORE any claim mutation (both the scalar and bundle
  // paths below persist it via writeState). A non-literal or newline-carrying value refuses here with
  // ZERO state mutation — the claim never reaches claimExplicitTarget/claimExplicitBundle.
  const cdm = resolveCodexDispatchModeFlag(args);
  if (cdm.invalid) {
    output({ verdict: 'invalid_codex_dispatch_mode', claim: 'none', project: null, issue: null,
      reasoning: '--codex-dispatch-mode must be exactly one of ' + CODEX_DISPATCH_MODES.join(' | ') +
        ' (single line); got ' + JSON.stringify(cdm.value) }, 1);
    return;
  }

  // #328: bundle path
  if (bundleTargets) {
    const result = claimExplicitBundle(root, args);
    // #430: post-claim assertion — verify persisted issue_numbers matches declared set.
    // A writeState that silently drops/coerces a member (e.g. single-element "bundle" → no
    // issue_numbers line) would pass result.status === 'acquired' while the durable state holds a
    // different set. Belt-and-suspenders: re-read workflow-state.md so a stale in-memory array
    // cannot mask the collapse. The #393a gate in writeState emits issue_numbers ONLY when
    // length > 1 — a single-element "bundle" has no issue_numbers line, so parseStateFile reads
    // it back as a scalar project; declared=[42], claimed=[] → mismatch → typed refusal.
    if (result.status === 'acquired') {
      const declared = (args.targetIssues || []).slice().sort((a, b) => a - b);
      let claimed = Array.isArray(result.issue_numbers)
        ? result.issue_numbers.slice().sort((a, b) => a - b)
        : [];
      try {
        const sf = stateFile(root, result.project);
        const persisted = (field(fs.readFileSync(sf, 'utf8'), 'issue_numbers') || '')
          .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
        if (persisted.length > 0) claimed = persisted;
      } catch (_) {}
      const same = declared.length === claimed.length
        && declared.every((n, i) => n === claimed[i]);
      if (!same) {
        output({
          verdict: 'target_set_mismatch', status: 'target_set_mismatch', claim: 'none',
          selected_project: result.project || null, selected_issue: null,
          target_source: 'user_directed',
          declared_set: declared, claimed_set: claimed,
          reasoning: 'bundle claim persisted issue set ' + JSON.stringify(claimed) +
            ' does not match the declared --target-issues ' + JSON.stringify(declared) +
            '; refusing to proceed on a silently-collapsed bundle (#430).'
        }, 1);
        return;
      }
    }
    output(Object.assign({
      verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
      claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
      selected_project: result.project || null,
      selected_issue: result.issue || null,
      target_source: 'user_directed',
      worktree_path: result.worktree_path || ''
    }, result), result.status === 'acquired' || result.status === 'owned' ? 0 : 1);
    return;
  }

  if (!scalarTarget) {
    // #403.2: every sibling refusal carries a `reasoning` field; the bare no_target one didn't. The
    // helper text already exists in claimExplicitTarget — mirror it so a caller logging refusals sees
    // a uniform shape.
    output({ verdict: 'no_target', claim: 'none', project: null, issue: null,
      reasoning: '--target-issue <N> (or --target-issues A,B,C) required; the workflow never auto-picks an issue (#44).' }, 1);
    return;
  }
  const result = claimExplicitTarget(root, Object.assign({}, args, { targetIssue: scalarTarget }));
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
  // #328: bundle path — delegate to cmdStartup which handles both scalar and bundle
  if (target || (Array.isArray(args.targetIssues) && args.targetIssues.length)) return cmdStartup();
  // #403.2: carry a reasoning field (sibling-refusal uniformity).
  output({ verdict: 'no_target', claim: 'none', project: null, issue: null,
    reasoning: '--target-issue <N> (or --target-issues A,B,C) required; the workflow never auto-picks an issue (#44).' }, 1);
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
// Path-agnostic: never reads path config (resume keys on the persisted workflow_path / a frozen
// workflow-plan.md, so resume works for any installed path — #538).
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
  if (!fs.existsSync(archiveDir)) return null;
  if (archiveDirDirty(root, project)) return { incomplete: true, reason: 'archived_impl_uncommitted' };
  return { incomplete: false, reason: 'already_finalized' };
}

function cmdResume() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  // #503: refuse silently picking folder[0] when multiple active folders exist and --project is absent.
  // Scripts validate+claim, never select under ambiguity (#44).
  // #579: if exactly ONE of the active folders classifies as 'mine' (same session marker), auto-select it
  // so a co-tenant lane running concurrently in the same checkout doesn't produce false ambiguity.
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
      const mine = active.filter(f => classifyLane(f, ctx).bucket === 'mine');
      if (mine.length === 1) {
        // Exactly one 'mine' — proceed as if --project=mine[0].project was passed.
        args.project = mine[0].project;
      } else {
        output({ resumed: false, reason: 'resume_ambiguous', candidates: active.map(f => f.project) }, 1);
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

// #333: terminal-stamp the workflow-state CONTENT for an archive. Pure string transform.
// statusValue: 'closed' | 'abandoned' (abandoned keeps mid-run state by design — #324).
// planDir: directory containing workflow-plan.md (live src BEFORE rename, or the archive
//          dest for the cmdFinalize backstop). Used to refresh plan_hash.
// opts.keepOpen: true on a keep-open partial-close archive (finalize --keep-open).
// Idempotent (every transform is a line-anchored replace) — safe to re-apply on crash-resume.
function stampTerminalState(content, statusValue, planDir, opts) {
  content = content.replace(/^status:\s*.*$/m, 'status: ' + statusValue);
  if (!/^status:/m.test(content)) content += '\nstatus: ' + statusValue + '\n';
  content = content.replace(/^step:\s*.*$/m, 'step: complete');
  if (!/^step:/m.test(content)) content += '\nstep: complete\n';
  if (statusValue !== 'closed') return content;   // discard/release keeps mid-run state (#324)
  // #324: normalize the pre-run blocks that writeState seeded at claim time (## Pending Gates:
  // - workflow-plan; last_command: startup / last_result: folder_claimed) so the archived state
  // cannot read as self-contradictory terminal state (closed/complete yet "pending workflow-plan").
  content = content.replace(/(^## Pending Gates\n)(?:[ \t]*-[ \t].*\n?)*/m, '$1- none\n');
  content = content.replace(/^last_command:\s*.*$/m, 'last_command: finalize');
  content = content.replace(/^last_result:\s*.*$/m,
    'last_result: ' + (opts && opts.keepOpen ? 'closed_keep_open' : 'closed'));
  // #333: an archived state must not advertise an active resume command.
  content = content.replace(/^next_command:\s*.*$/m, 'next_command: none (archived)');
  content = content.replace(/^next_skill:\s*.*$/m, 'next_skill: none (archived)');
  // #333: refresh Planning Evidence plan_hash from the FINAL workflow-plan.md (a mid-run
  // re-freeze re-stamps only the plan file's <!-- plan_hash --> comment; the state keeps the
  // freeze-time hash). No-ops for non-adaptive projects (no plan file / no plan_hash line).
  try {
    const planContent = fs.readFileSync(path.join(planDir, adaptiveSchema.PLAN_FILE), 'utf8');
    const hm = planContent.match(/<!--\s*plan_hash:\s*([0-9a-f]{64})\s*-->/);
    if (hm) content = content.replace(/^plan_hash:\s*[0-9a-f]{64}\s*$/m, 'plan_hash: ' + hm[1]);
  } catch (_) {}
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
      'closure_invariants: ' + fields.closureInvariants + '\n' +
      'claim_planner_attested: ' + fields.claimPlannerAttested + '\n' +
      'finalize_contractor_attested: ' + fields.finalizeContractorAttested + '\n';
    fs.writeFileSync(p, s);
    return true;
  } catch (_) { return false; }
}

// n2 (#653 finding A): durably persist a non-empty attestation warning into the archived
// finalization-summary.md. checkDispatchAttestations only surfaced the warning on stdout JSON —
// an archive-only audit could never see it. Presence-guarded on /^## Attestation$/m (idempotent
// across crash-resume re-runs); creates the file when absent; swallow-on-error. Always writes the
// two column-0 status fields, even when both are attested — a clean result is a positive
// statement, not an absence.
function persistAttestationToSummary(destDir, receipt) {
  try {
    const p = path.join(destDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { /* create-if-absent */ }
    if (/^## Attestation$/m.test(s)) return false;
    const attestationWarnings = (receipt.warnings || []).filter(w =>
      typeof w === 'string' && (w.indexOf('ATTESTATION WARNING') === 0 || w.indexOf('attestation:') === 0));
    let block = '## Attestation\n' +
      'claim_planner_attested: ' + receipt.claim_planner_attested + '\n' +
      'finalize_contractor_attested: ' + receipt.finalize_contractor_attested + '\n';
    for (const w of attestationWarnings) block += w + '\n';
    fs.writeFileSync(p, s ? (s.trimEnd() + '\n\n' + block) : block);
    return true;
  } catch (_) { return false; }
}

// n5 (#653 finding D3): advisory selection-evidence probe. A file matching selection-evidence.*
// in either cache dir means the router docked the issue-scout's recommendation (see
// workflow-next.md § Selection Evidence Docking) before dispatching the executor. Advisory
// only — no invariant, no warning on absence: a user-named claim legitimately has none, since
// the scout never runs on that branch.
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

// #395.2: remove the roadmap source(s) for the given member numbers (respecting keep-open),
// reconcile the MAIN-repo staged-ADD orphan (#297), and regenerate the mirror. Extracted so BOTH
// archiveProjectDir's close loop AND cmdFinalize's source-missing backstop call ONE convergent
// path — the #395 bug was that a crash between renameSync and this loop left the roadmap source
// permanently live (the backstop early-returned BEFORE any roadmap removal, so finalize re-run
// could never converge). Idempotent: ENOENT/already-removed read as 'absent' and never error.
// #705: opts.keepRoadmapSource keeps EVERY member's source (whole-run keep-open); opts.excludeIssues
// is the PER-MEMBER form — a set/array of member numbers whose sources are RETAINED while the rest
// are still removed (a mixed close/keep-open bundle: the kept-open issue stays tracked, the closing
// members' sources go). An open issue must never be dropped from the mirror.
// Returns { roadmap_source_removed (scalar, primary), roadmap_regenerated, roadmap_sources_removed }.
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
          // #403.7: only record an actual unstage — the staged-ADD orphan must be present in the
          // index for `rm --cached` to do work (probe via diff --cached --name-only). --ignore-unmatch
          // means rm never errors when nothing is staged, so probe first to avoid a false receipt.
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
  if (mainRoot && mainRoot !== linkedRoot && !(opts && opts.keepRoadmapSource) && !(opts && opts.keepWorktree)) {
    try { roadmapModule.regenerateRoadmap(mainRoot); } catch (_) {}
  }
  return { roadmap_source_removed: roadmapSourceRemoved, roadmap_regenerated: roadmapRegenerated, roadmap_sources_removed: removedSources, roadmap_staged_reconciled: stagedReconciled, roadmap_removed_by_root: roadmapByRoot, roadmap_residue: residue };
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

// E2 owns epoch semantics; lifecycle consumers compose both exported views so
// a planned/current-authority tamper can never pass merely because its snapshot
// sequence remains intact. The same helper is used before archive and again on
// the archived destination/closure receipt.
function verifyArchiveEpochAuthority(projectPath) {
  let replan;
  let current;
  let snapshots;
  try {
    replan = require('./kaola-workflow-replan');
    current = replan.verifyCurrentEpochAuthority(projectPath);
    snapshots = current && current.ok ? replan.verifyAllEpochSnapshots(projectPath) : null;
  } catch (error) {
    return { ok: false, reason: 'snapshot_verifier_unavailable', detail: error.message };
  }
  if (!current || current.ok !== true) return current || { ok: false, reason: 'current_epoch_authority_invalid' };
  if (!snapshots || snapshots.ok !== true) return snapshots || { ok: false, reason: 'snapshot_authority_invalid' };
  return { ok: true, current, snapshots };
}

function archiveProjectDir(root, project, statusValue, suffix, opts) {
  assert(isSafeName(project), 'unsafe project name');
  const src = projectDir(root, project);
  if (!fs.existsSync(src)) return { skipped: 'source-missing' };
  // Deterministic refusal seam for caller-level fail-closed tests.  It fires
  // before even terminal-state stamping, so the live source remains untouched.
  if (process.env.KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL === '1') {
    return { archived: false, reason: 'archive_forced_refusal' };
  }
  const snapshots = verifyArchiveEpochAuthority(src);
  if (!snapshots.ok) {
    return { skipped: undefined, archived: false, archive_incomplete: true,
      missing: [], snapshot_error: snapshots.reason || snapshots.detail || 'snapshot_invalid' };
  }
  // #707: fail-closed node-evidence floor for the archive-owning sink (opts.requireNodeEvidence).
  // Both archive branches below (linked-run copy AND in-place rename) destroy the last live copy;
  // the in-place rename path never runs verifyArchiveComplete at all ("trivially complete" —
  // true for COPY fidelity, blind to a source that was ALREADY evidence-gutted). So the guard
  // runs HERE, before any mutation (state stamping, sentinel rewrites, rename/copy): when the
  // `## Node Ledger` proves node evidence was recorded during the run (complete rows) but the
  // source folder no longer holds it, refuse and leave everything untouched. Opt-in because
  // finalize paths archiving minimal/legacy folders enforce their evidence policy elsewhere; the
  // sink is the last writer before the live copies disappear.
  if (statusValue === 'closed' && opts && opts.requireNodeEvidence) {
    const recordedEvidence = listRecordedNodeEvidence(src);
    const missingEvidence = recordedEvidence.filter(rel => !fs.existsSync(path.join(src, ...rel.split('/'))));
    if (missingEvidence.length) {
      return {
        archived: false, archive_incomplete: true, reason: 'node_evidence_missing',
        missing: missingEvidence,
        detail: 'the ## Node Ledger proves node evidence was recorded during the run (complete rows), but '
          + missingEvidence.length + ' evidence file(s) are absent from the live folder being archived. '
          + 'Archiving now would persist an evidence-empty archive and delete the last live copy. '
          + 'Restore the run\'s .cache evidence (the worktree copy, if it still exists) and re-run.'
      };
    }
  }
  const state = stateFile(root, project);
  let archiveIssueNumber = null;
  // #328: read issue_numbers early (before rename) so we have the full member list
  let archiveIssueNumbersRaw = '';
  try {
    let content = fs.readFileSync(state, 'utf8');
    archiveIssueNumber = parseInt(field(content, 'issue_number'), 10);
    archiveIssueNumbersRaw = (field(content, 'issue_numbers') || '').trim();
    content = removeLegacyStateBlocks(content);
    // #333: status/step/#324-normalization/next_command/plan_hash/Last Updated all in one helper.
    content = stampTerminalState(content, statusValue, src, opts);
    fs.writeFileSync(state, content);
  } catch (_) {}
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
        fs.writeFileSync(summaryPath, s);
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
        fs.writeFileSync(finalValPath, fv);
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
    // #426: branch on keepWorktree.
    // - Non-keep-worktree: archive goes to MAIN first (durable before worktree removal).
    // - Keep-worktree: archive goes to LINKED WORKTREE (worktree is kept + merged into main;
    //   writing to main as untracked files would block sink-merge's git checkout).
    const keepWorktree = !!(opts && opts.keepWorktree);
    const archiveParent = keepWorktree ? linkedRoot : mainRoot;
    const archiveBase = path.join(archiveParent, 'kaola-workflow', 'archive');
    fs.mkdirSync(archiveBase, { recursive: true });
    dest = path.join(archiveBase, project + (suffix || ''));
    if (fs.existsSync(dest)) dest += '.archived-' + new Date().toISOString().replace(/[:.]/g, '-');
    copyDir(src, dest);
    // (c) verify archive completeness before any deletion. #676: SOURCE-RELATIVE — every evidence
    // file that exists in the live SOURCE folder must survive into the copied DEST; a lossy copy
    // that dropped the frozen plan / finalization summary / a per-node .cache gate-evidence file
    // refuses here, before either live copy is deleted (see verifyArchiveComplete). #707: an
    // evidence-requiring archiver additionally demands the ledger-proven node evidence in DEST.
    const v = verifyArchiveComplete(src, dest, { requireLedgerEvidence: !!(opts && opts.requireNodeEvidence) });
    if (!v.ok) return { skipped: undefined, archived: false, archive_incomplete: true, missing: v.missing, dest };
    // (d) delete BOTH live copies — only after copy+verify confirmed.
    fs.rmSync(src, { recursive: true, force: true });          // worktree live folder
    const mainLive = path.join(mainRoot, 'kaola-workflow', project);
    if (fs.existsSync(mainLive)) {
      try {
        if (fs.realpathSync(mainLive) !== dest)
          fs.rmSync(mainLive, { recursive: true, force: true }); // main live folder
      } catch (_) {}
    }
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
    // #395.2: the per-member roadmap removal + MAIN-orphan reconcile + regenerate is now ONE shared
    // helper, reused by the cmdFinalize source-missing backstop so a crash-resume converges.
    const reconciled = reconcileRoadmapForClosure(root, archiveIssueNumbers, archiveIssueNumber, opts, mainRoot, linkedRoot);
    roadmapSourceRemoved = reconciled.roadmap_source_removed;
    roadmapRegenerated = reconciled.roadmap_regenerated;
    for (const s of reconciled.roadmap_sources_removed) removedSources.push(s);
    stagedReconciled = reconciled.roadmap_staged_reconciled || [];
    // #428: surface dual-root removal map + residue so cmdFinalize can attach them to the receipt.
    return {
      archived: true,
      dest,
      roadmap_source_removed: roadmapSourceRemoved,
      roadmap_regenerated: roadmapRegenerated,
      roadmap_sources_removed: removedSources,
      roadmap_staged_reconciled: stagedReconciled,
      roadmap_removed_by_root: reconciled.roadmap_removed_by_root || {},
      roadmap_residue: reconciled.roadmap_residue || [],
    };
  }
  return {
    archived: true,
    dest,
    roadmap_source_removed: roadmapSourceRemoved,
    roadmap_regenerated: roadmapRegenerated,
    roadmap_sources_removed: removedSources,
    roadmap_staged_reconciled: stagedReconciled
  };
}

function archiveProjectDirSafely(root, project, statusValue, suffix, opts) {
  try {
    return archiveProjectDir(root, project, statusValue, suffix, opts);
  } catch (error) {
    return { archived: false, reason: 'archive_exception', detail: error && error.message ? error.message : String(error) };
  }
}

// Translate an explicitly successful archive into the closure receipt's
// lineage token.  The token is never inferred from `archived:true` alone: the
// archived destination is recursively re-verified first, matching finalize.
function archiveEpochLineagePreserved(result) {
  if (!closureContract.archiveSucceeded(result)) return 'failed';
  if (!result.dest) return 'absent';
  const epochCheck = verifyArchiveEpochAuthority(result.dest);
  if (!epochCheck.ok) return 'failed';
  let schema2 = false;
  try { schema2 = field(fs.readFileSync(path.join(result.dest, 'workflow-state.md'), 'utf8'),
    'epoch_schema_version') === '2'; } catch (_) {}
  return fs.existsSync(path.join(result.dest, '.cache', 'epochs')) || schema2 ? 'preserved' : 'absent';
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
  // Some closure transports (notably the merge sink) construct their final
  // receipt after cmdFinalize has already archived the project. Rebind the
  // seeded failure token to a fresh recursive verification of that archive so
  // those callers neither report a false lineage failure nor trust a copied
  // success token. A malformed/missing archive remains `failed` and therefore
  // still trips the invariant below.
  if (receipt && archiveDest && (receipt.archive === 'closed' || abandoned)) {
    receipt.epoch_lineage_preserved = archiveEpochLineagePreserved({
      archived: fs.existsSync(archiveDest),
      dest: archiveDest,
    });
  }
  // #328: for a bundle project, loop roadmap-source-absent + roadmap-mirror-clean checks
  // over ALL members; fall back to scalar issue_number for single-issue (AC#1 unchanged).
  const memberNumbers = Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length
    ? receipt.issue_numbers
    : (Number.isInteger(issueNumber) && issueNumber > 0 ? [issueNumber] : []);
  // #336: keep-open inverts the roadmap checks — the source MUST survive and the mirror MUST
  // still list #N (the issue stays open).
  // #396.3: key on the RECORDED INTENT (keep_open_requested), not the mutable remote_issue_closed
  // token. When keep-open is requested but the issue was already auto-closed on the forge, the token
  // flips to 'already_closed' → the old keying took the CLOSE branch and flagged roadmap-source-absent
  // + roadmap-mirror-clean even though keeping the source was correct. Fall back to the legacy token
  // when keep_open_requested is absent (older receipts / callers that don't set it).
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
  if (receipt.epoch_lineage_preserved === 'failed') {
    const invEpoch = closureContract.CLOSURE_INVARIANTS.find(function(i) { return i.id === 'epoch-lineage-preserved'; });
    violations.push({ id: 'epoch-lineage-preserved', description: invEpoch ? invEpoch.description : 'epoch lineage was not preserved' });
  }
  // #369 remote-members-closed: for a bundle, every member must be closed. A member left in
  // failed_issue_closures or open_issues (recorded while online) flags this WARN-FIRST-but-VISIBLE
  // invariant so a partial close is never a clean success. Keyed on the post-attached receipt arrays
  // (single-issue receipts carry neither, so this never fires for them — AC7).
  const unclosedMembers = []
    .concat(Array.isArray(receipt.failed_issue_closures) ? receipt.failed_issue_closures : [])
    .concat(Array.isArray(receipt.open_issues) ? receipt.open_issues : []);
  // #396.4 (D2): cmdFinalize runs BEFORE sink-merge closes members, so on a NORMAL bundle merge-lane
  // finalize every member buckets open_issues → this invariant would fire on the happy path
  // (alarm fatigue). cmdFinalize tags its receipt close_disposition:'close_pending'; SKIP the
  // invariant in that case (the members WILL close at sink). sink-merge / watch-pr (post-sink) leave
  // close_disposition unset, so the invariant fires there truthfully on a real partial close.
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

// #441: Compute goal_check for the finalize closure receipt.
// Advisory only — never throws, never blocks finalize.
// planDirs: ordered array of directories to search for workflow-plan.md (archive dest first,
//   then live). Returns 'satisfied', 'absent'. 'unsatisfied' is reserved for future use.
// v1 rule: KAOLA_GOAL set + non-empty → 'satisfied'; else plan goal: line present → 'satisfied';
//   otherwise → 'absent'.
function computeGoalCheck(planDirs) {
  const envGoal = (process.env.KAOLA_GOAL || '').trim();
  if (envGoal) return 'satisfied';
  // Probe each planDir for a workflow-plan.md with a goal: line.
  for (const dir of (planDirs || [])) {
    if (!dir) continue;
    try {
      const planPath = path.join(dir, adaptiveSchema.PLAN_FILE);
      if (!fs.existsSync(planPath)) continue;
      const content = fs.readFileSync(planPath, 'utf8');
      const { goal } = parseGoal(content);
      if (goal) return 'satisfied';
    } catch (_) {}
  }
  return 'absent';
}

// Source-missing Finalization must bind to one archive transaction authority, never merely to the
// historical exact path. archiveProjectDir suffixes a new destination when archive/<project>
// already exists, so exact + suffixed matches are ambiguous without a surviving live claim anchor.
// Return every matching authority across the linked/main roots; the caller accepts exactly one.
function findArchiveAuthorities(root, project) {
  const candidateRoots = [root];
  try {
    const main = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    if (!candidateRoots.some(candidate => path.resolve(candidate) === path.resolve(main))) {
      candidateRoots.push(main);
    }
  } catch (_) {}
  const authorities = [];
  const seen = new Set();
  for (const candidateRoot of candidateRoots) {
    const archiveBase = path.join(candidateRoot, 'kaola-workflow', 'archive');
    let names = [];
    try { names = fs.readdirSync(archiveBase); }
    catch (_) {
      if (fs.existsSync(path.join(archiveBase, project))) names = [project];
    }
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

function cmdFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
  const finalizeLiveDir = projectDir(root, args.project);
  let finalizeLiveSourcePresent = false;
  try {
    fs.lstatSync(finalizeLiveDir);
    finalizeLiveSourcePresent = true;
  } catch (error) {
    // Only a genuinely absent directory enters the source-missing crash-resume
    // path. An unreadable entry remains live authority and fails type proof below.
    finalizeLiveSourcePresent = !error || error.code !== 'ENOENT';
  }
  let finalizeAuthorityDir = null;
  let finalizeAuthorityState = '';
  // Finalization may legitimately resume after archiveProjectDir has already moved the live
  // source, but plan absence must never turn a malformed LIVE source into that crash-resume
  // exemption. Prove that the selected authority has a readable regular state file before any
  // gate or archive side effect. A source-missing archive is a narrow crash-resume exemption:
  // archiveProjectDir must already have terminal-stamped it closed before the rename. An active,
  // abandoned, or otherwise nonterminal manual move is not proof that the live finalize gates ran.
  {
    const authorityCandidates = finalizeLiveSourcePresent
      ? [finalizeLiveDir]
      : findArchiveAuthorities(root, args.project);
    finalizeAuthorityDir = authorityCandidates.length === 1 ? authorityCandidates[0] : null;
    const authorityStatePath = finalizeAuthorityDir
      ? path.join(finalizeAuthorityDir, 'workflow-state.md') : null;
    let innerReason = null;
    if (!finalizeLiveSourcePresent && authorityCandidates.length > 1) {
      innerReason = 'archive_authority_ambiguous';
    } else if (!finalizeAuthorityDir) {
      innerReason = 'archive_authority_missing';
    } else {
      let authorityStat = null;
      try { authorityStat = fs.lstatSync(finalizeAuthorityDir); } catch (_) {}
      if (!authorityStat || !authorityStat.isDirectory() || authorityStat.isSymbolicLink()) {
        innerReason = 'archive_authority_invalid_type';
      }
      let stateStat = null;
      try { if (!innerReason) stateStat = fs.lstatSync(authorityStatePath); }
      catch (error) { innerReason = error && error.code === 'ENOENT' ? 'state_missing' : 'state_unreadable'; }
      if (!innerReason && (!stateStat || !stateStat.isFile() || stateStat.isSymbolicLink())) {
        innerReason = 'state_invalid_type';
      }
      if (!innerReason) {
        try { finalizeAuthorityState = fs.readFileSync(authorityStatePath, 'utf8'); }
        catch (_) { innerReason = 'state_unreadable'; }
      }
      if (!innerReason && !finalizeLiveSourcePresent
          && field(finalizeAuthorityState, 'status') !== 'closed') {
        innerReason = 'archive_state_not_closed';
      }
    }
    if (innerReason) {
      output({
        result: 'refuse',
        reason: 'finalize_gate_unverified',
        gate: 'workflow_state',
        inner_reason: innerReason,
        operator_hint: finalizeLiveSourcePresent
          ? 'Restore workflow-state.md as a readable regular file before Finalization. No archive or closure side effect was made.'
          : (innerReason === 'archive_state_not_closed'
            ? 'Restore the live project and complete Finalization from its verified gates. Only an archive already stamped status: closed by the finalize transaction may resume source-missing; no closure side effect was made.'
            : (innerReason === 'archive_authority_ambiguous'
              ? 'Multiple exact/suffixed archives match this project, so no current transaction authority can be proven. Restore the live project or retain exactly the archive for the interrupted finalize transaction; no closure side effect was made.'
              : 'Restore a valid archived workflow-state.md authority before resuming Finalization. No closure side effect was made.')),
        errors: [innerReason]
      }, 1);
      return;
    }
  }
  // Re-plan fencing is a pre-side-effect finalization gate. A partial epoch
  // transition may be resumed only by the transaction authority; archive,
  // issue, branch, and worktree mutation remain forbidden until it commits and
  // every durable parent snapshot re-verifies.
  {
    const authorityDir = finalizeAuthorityDir;
    const authorityState = authorityDir ? path.join(authorityDir, 'workflow-state.md') : null;
    const txPath = authorityDir
      ? path.join(authorityDir, '.cache', adaptiveSchema.REPLAN_TRANSACTION_NAME) : null;
    let stateContent = '';
    let transaction = null;
    if (authorityDir) {
      try { stateContent = fs.readFileSync(authorityState, 'utf8'); } catch (_) {}
      try { transaction = JSON.parse(fs.readFileSync(txPath, 'utf8')); }
      catch (_) { transaction = txPath && fs.existsSync(txPath) ? {} : null; }
      const fence = adaptiveSchema.readReplanFence(stateContent, transaction);
      if (!fence.ok || fence.fenced) {
        output({ result: 'refuse', reason: fence.reason || 'replan_in_progress',
          phase: fence.phase || null, transaction_id: fence.transaction_id || null,
          legal_mutation: fence.legal_mutation || 'replan resume' });
        process.exitCode = 1;
        return;
      }
      const snapshots = verifyArchiveEpochAuthority(authorityDir);
      if (!snapshots.ok) {
        output({ result: 'refuse', reason: 'replan_snapshot_incomplete',
          detail: snapshots.reason || snapshots.detail || null });
        process.exitCode = 1;
        return;
      }
    }
  }
  // #336: keep-open terminal mode — explicit flag OR the durable ## Sink issue_action field.
  // State-field derivation makes the durable record the source of truth (a contractor that
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
  // #522: FINALIZE GATE — BEFORE any irreversible side effect (archive rename, worktree removal,
  // issue close). When a workflow-plan.md is present (adaptive run), shell the plan-validator's
  // --finalize-check which enforces the dual-mode validation gate:
  //   SELF-HOST (npm): chain-receipt.json bound to HEAD must exist, be fresh, and be all-green.
  //   CONSUMER (non-npm): .cache/final-validation.md with column-0 `verdict: pass` must exist.
  // Both modes also run the attribution sweep (B). On any non-`pass` result, refuse to commit —
  // exit non-zero with finalize_gate_unverified carrying the inner reason. Gate is UNCONDITIONAL
  // for BOTH the --keep-worktree path and the in-place path, placed here (before archiveProjectDir)
  // so no side effect has occurred on refusal. A plan-absent full run (including the contract's
  // absent-field default) shells sibling full-advance phase5-verify; only explicit fast stays N/A.
  {
    const authorityPlanPath = path.join(finalizeAuthorityDir, adaptiveSchema.PLAN_FILE);
    if (fs.existsSync(authorityPlanPath)) {
      const validatorScript = path.join(__dirname, 'kaola-workflow-plan-validator.js');
      let gateResult = null;
      let gateError = null;
      try {
        // #539: forward --base to the whole-plan --finalize-check ONLY, so the attribution sweep
        // can scope to a project's OWN diff on a SHARED multi-issue branch. Sourced from --base <ref>
        // and/or KAOLA_FINALIZE_BASE env, defaulting to UNSET (→ the validator's `main` default —
        // byte-equivalent to today for branch-per-issue runs, so existing tests stay green). The
        // per-node --barrier-check STILL rejects --base (the anti-laundering guard) — unchanged.
        const finalizeBase = args.base || (process.env.KAOLA_FINALIZE_BASE || '').trim() || null;
        const validatorArgv = [validatorScript, authorityPlanPath, '--finalize-check', '--json'];
        if (finalizeBase) validatorArgv.push('--base', finalizeBase);
        const raw = execFileSync(process.execPath, validatorArgv,
          { cwd: root, encoding: 'utf8', timeout: 120000 });
        gateResult = JSON.parse(raw.trim());
      } catch (e) {
        // Non-zero exit from validator means a refusal — parse its JSON output.
        const stdout = e && e.stdout ? String(e.stdout).trim() : '';
        try { gateResult = JSON.parse(stdout); } catch (_) { gateError = stdout || String(e && e.message || e); }
      }
      if (!gateResult || gateResult.result !== 'pass') {
        const innerReason = (gateResult && gateResult.reason) || gateError || 'validator_error';
        const innerHint = (gateResult && gateResult.operator_hint) ||
          'Resolve the inner refusal, then re-run finalize. No archive commit was made.';
        output({
          result: 'refuse',
          reason: 'finalize_gate_unverified',
          inner_reason: innerReason,
          operator_hint: innerHint,
          errors: (gateResult && gateResult.errors) || [innerReason]
        }, 1);
        return;
      }
    } else {
      const workflowPath = field(finalizeAuthorityState, 'workflow_path');
      if (!workflowPath || workflowPath === 'full') {
        const fullAdvanceScript = path.join(__dirname, 'kaola-workflow-full-advance.js');
        let gateResult = null;
        let gateError = null;
        let gateExitedZero = false;
        let verifierRoot = root;
        let verifierProjectionRoot = null;
        try {
          // full-advance intentionally accepts only <root>/kaola-workflow/<project> authority.
          // For a source-missing terminal archive, project its preserved evidence into a private
          // temporary root so the unchanged verifier can re-run read-only against the archived
          // bytes. preserveTimestamps keeps its freshness checks meaningful. The repository is
          // never mutated by this projection and the directory is removed in finally.
          if (!finalizeLiveSourcePresent) {
            verifierProjectionRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-verify-')));
            const projectedWorkflowDir = path.join(verifierProjectionRoot, 'kaola-workflow');
            fs.mkdirSync(projectedWorkflowDir, { recursive: true });
            fs.cpSync(finalizeAuthorityDir, path.join(projectedWorkflowDir, args.project), {
              recursive: true,
              dereference: false,
              preserveTimestamps: true,
              verbatimSymlinks: true,
            });
            verifierRoot = verifierProjectionRoot;
          }
          const raw = execFileSync(process.execPath, [fullAdvanceScript, 'phase5-verify',
            '--project', args.project, '--root', verifierRoot, '--json'],
          { cwd: verifierRoot, encoding: 'utf8', timeout: 120000 });
          gateResult = JSON.parse(raw.trim());
          gateExitedZero = true;
        } catch (e) {
          const stdout = e && e.stdout ? String(e.stdout).trim() : '';
          try { gateResult = JSON.parse(stdout); } catch (_) { gateError = stdout || String(e && e.message || e); }
        } finally {
          if (verifierProjectionRoot) {
            try { fs.rmSync(verifierProjectionRoot, { recursive: true, force: true }); } catch (_) {}
          }
        }
        if (!gateExitedZero || !gateResult || gateResult.result !== 'ok' ||
            gateResult.phase5_verified !== true || gateResult.project !== args.project) {
          const innerReason = (gateResult && gateResult.reason) || gateError || 'full_phase5_verifier_error';
          const innerHint = (gateResult && gateResult.operator_hint) ||
            'Repair the full-path Phase 5 evidence, then re-run finalize. No archive or closure side effect was made.';
          output({
            result: 'refuse',
            reason: 'finalize_gate_unverified',
            gate: 'full_phase5',
            inner_reason: innerReason,
            operator_hint: innerHint,
            errors: (gateResult && gateResult.errors) || [innerReason]
          }, 1);
          return;
        }
      } else if (workflowPath !== 'fast') {
        const innerReason = workflowPath === 'adaptive' ? 'adaptive_plan_missing' : 'invalid_workflow_path';
        output({
          result: 'refuse',
          reason: 'finalize_gate_unverified',
          gate: 'workflow_path',
          inner_reason: innerReason,
          workflow_path: workflowPath,
          operator_hint: workflowPath === 'adaptive'
            ? 'Restore the frozen workflow-plan.md before Finalization. No archive or closure side effect was made.'
            : 'Repair workflow_path to an installed canonical value before Finalization. No archive or closure side effect was made.',
          errors: [innerReason]
        }, 1);
        return;
      }
    }
  }
  const result = archiveProjectDirSafely(root, args.project, 'closed', undefined, { keepOpen: keepIssueOpen, keepRoadmapSource: keepIssueOpen, keepWorktree: args.keepWorktree });
  if (!closureContract.archiveSucceeded(result) && result.archive_incomplete !== true) {
    output({
      result: 'refuse',
      reason: result.reason || result.snapshot_error || 'archive_refused',
      project: args.project,
      detail: result.detail,
      reasoning: 'archival did not return an explicit success result; no roadmap, issue, label, worktree, or branch cleanup was performed.'
    }, 1);
    return;
  }
  if (result.skipped === 'source-missing') result.dest = result.dest || finalizeAuthorityDir;
  // #676: receipt honesty — a lossy archive copy (verifyArchiveComplete refused BEFORE deleting
  // the live copy/copies because the DEST dropped an evidence file the live SOURCE held) must halt
  // finalize here, before any downstream side effect (roadmap source removal, issue close,
  // claim-label removal). Without this, cmdFinalize would fabricate a status:'closed' receipt while
  // archived:false/archive_incomplete:true sat right beside it, and would still close the issue /
  // remove the roadmap source for a run whose archive copy silently lost gate evidence. The live
  // folder(s) already survived (that is the whole point of the pre-deletion gate); this just
  // refuses to lie about it.
  if (result.archive_incomplete === true) {
    output({
      result: 'refuse',
      reason: 'archive_incomplete',
      project: args.project,
      missing: result.missing,
      dest: result.dest,
      reasoning: 'the archive copy dropped evidence the live project still held (' +
        (Array.isArray(result.missing) ? result.missing.join(', ') : 'unknown') +
        '); the live project folder was left in place — no roadmap/issue/label side effect was ' +
        'performed. Re-run finalize so the archive faithfully preserves every workflow-plan.md / ' +
        'workflow-state.md / finalization-summary.md / .cache/n*-*.md file the source contains.'
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
  // #333: source-missing convergence uses only the already-terminal, uniquely selected authority
  // proven above. Manual/nonterminal archives never reach this block.
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
        if (st !== 'closed' && st !== 'abandoned') {
          fs.writeFileSync(destState,
            stampTerminalState(removeLegacyStateBlocks(raw), 'closed', destDir, { keepOpen: keepIssueOpen }));
          archiveStateStamped = 'repaired';
        }
        // lets the ## Closure append + invariants + issue_number fallback see the dir
        result.dest = result.dest || destDir;
        // #395.4: worktree variant — a crash between archiveProjectDir's renameSync (in the linked
        // worktree) and its MAIN-root live-folder cleanup leaves a surviving MAIN copy that keeps
        // readActiveFolders claiming the project (user_target_blocked on re-claim). On finalize
        // re-run, archiveProjectDir source-missing never reaches that cleanup — re-run it here.
        try {
          const mainRoot4 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
          const linkedRoot4 = fs.realpathSync(root);
          if (mainRoot4 && mainRoot4 !== linkedRoot4) {
            const mainLive = path.join(mainRoot4, 'kaola-workflow', args.project);
            if (fs.existsSync(mainLive)) {
              fs.rmSync(mainLive, { recursive: true, force: true });
              result.main_live_cleaned_on_resume = true;
            }
          }
        } catch (_) {}
        // #395.2: the #395 NON-CONVERGENT-RECOVERY fix. A kill in archiveProjectDir's gap (live
        // folder renamed to archive, but the roadmap-source-unlink loop never ran) leaves the
        // archive present + the roadmap source(s) still live + ROADMAP.md still listing a closed
        // issue. archiveProjectDir early-returned source-missing BEFORE its roadmap loop, so
        // finalize re-run never cleaned up (a permanent orphan). Now, when the archived state is
        // terminal-closed (not keep-open) and any member's roadmap source is still live, run the
        // SAME reconcile helper so re-run / resume routing converges. Idempotent.
        if (!keepIssueOpen) {
          // member set: prefer issue_numbers from the archived state, else scalar issue_number.
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
            // surface the convergence on the result so the receipt reflects the repair (not 'failed').
            result.roadmap_source_removed = rec.roadmap_source_removed;
            result.roadmap_regenerated = rec.roadmap_regenerated;
            result.roadmap_sources_removed = rec.roadmap_sources_removed;
            result.roadmap_reconciled_on_resume = true;
            // #428: surface dual-root removal map + residue from the resume reconcile path.
            if (rec.roadmap_removed_by_root) result.roadmap_removed_by_root = rec.roadmap_removed_by_root;
            if (rec.roadmap_residue) result.roadmap_residue = rec.roadmap_residue;
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
  let issueNumber = folder && folder.issue_number;
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
      const labelStatus = clearAdvisoryClaim(n, 'finalized', args.project);
      if (n === issueNumber) claimLabelRemoved = labelStatus;
    }
    if (claimLabelRemoved == null) claimLabelRemoved = 'failed';
  } else {
    // Single-issue path (unchanged)
    claimLabelRemoved = clearAdvisoryClaim(issueNumber, 'finalized', args.project);
  }
  // #328: per-member remote close probe (warning-first: catch per member, accumulate, never abort)
  // Uses probeIssueState (from active-folders.js, already imported) for consistent JSON parsing.
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
      // probe each member (bundle) or the scalar issue; never abort.
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
    // closed → closed_issues; unavailable → failed_issue_closures; still-open-while-online → open_issues.
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
    // #369: truthful ONLINE token — all closed → already_closed; any member open/failed → partial
    // (never `skipped_offline`, which is the OFFLINE-only token).
    // #508: add close_pending arm for the all-open merge-lane case. When none are closed
    // (closedIssues=[]), reporting 'partial' produces a token-vs-list disagreement: the token
    // claims "some closed" while the list is empty. Mirror the single-issue semantics: when no
    // members are closed yet the close is PENDING (deferred to sink-merge on the merge lane).
    // The 'partial' arm still covers the genuinely mixed case (some already-closed on the forge).
    remoteIssueClosed = (closedIssues.length === issueNumbers.length) ? 'already_closed'
      : (closedIssues.length === 0 ? 'close_pending' : 'partial');
  } else if (!OFFLINE && issueNumber) {
    // #396.2: single-issue ONLINE path. The old `closed ? 'already_closed' : 'skipped_offline'`
    // conflated "online, close pending at sink" with "offline" — the most common scalar path read
    // `skipped_offline` while online (#369 fixed exactly this for bundles; the scalar arm lagged).
    // Truthful ONLINE token: already closed on the forge → 'already_closed'; otherwise the close is
    // PENDING (sink-merge closes it) → 'close_pending'. A probe error degrades to 'skipped_offline'.
    try {
      const viewOut = ghExec(['issue', 'view', String(issueNumber), '--json', 'state', '--jq', '.state']);
      remoteIssueClosed = (viewOut && viewOut.trim().toLowerCase() === 'closed') ? 'already_closed' : 'close_pending';
    } catch (_) { remoteIssueClosed = 'skipped_offline'; }
  }
  // #427: execute `gh issue close` for each open member. Probe-before-close: members already
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
  // #396 (D2): cmdFinalize runs BEFORE sink-merge closes members. On the normal merge lane (not
  // keep-open, the issue not already closed) the close is PENDING — record close_disposition so
  // checkClosureInvariants skips remote-members-closed (the members WILL close at sink). When the
  // issue is already closed on the forge (already_closed) the disposition is genuinely terminal, so
  // close_pending does NOT apply. Offline never close-pends (no remote close happens at all).
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
    // #396.3: record the keep-open INTENT so checkClosureInvariants keys on intent, not the
    // mutable remote_issue_closed token (which flips to 'already_closed' on a forge auto-close).
    keep_open_requested: !!keepIssueOpen,
    // #396.4 (D2): tag the merge-lane close-pending so the pre-sink remote-members-closed alarm is
    // suppressed (it is the EXPECTED happy-path output here; sink-merge fires it truthfully later).
    close_disposition: closePendingFinalize ? 'close_pending' : undefined
  });
  closureReceipt.epoch_lineage_preserved = archiveEpochLineagePreserved(result);
  // #416: attach probe_degraded AFTER buildClosureReceipt (the builder filters by
  // CLOSURE_RECEIPT_FIELDS; probe_degraded is not in the schema yet, so attach post-build).
  if (probeDegraded) closureReceipt.probe_degraded = true;
  // #426: attach anchored_root post-build (added to CLOSURE_RECEIPT_FIELDS in n3; kept here
  // so the receipt carries the durable main-root path independent of schema update).
  if (closureReceipt) closureReceipt.anchored_root = cmdFinalizeIsLinkedRun ? cmdFinalizeMainRoot : root;
  // #428: dual-root roadmap receipt
  if (result.roadmap_removed_by_root) closureReceipt.roadmap_removed = result.roadmap_removed_by_root;
  if (result.roadmap_residue && result.roadmap_residue.length > 0) closureReceipt.roadmap_residue = result.roadmap_residue;
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
  // #403.7: record the #297 MAIN staged-ADD orphan unstage (was silent: `roadmap_staged:true` then
  // the file vanished). Attach only when something was actually reconciled.
  if (Array.isArray(result.roadmap_staged_reconciled) && result.roadmap_staged_reconciled.length > 0) {
    closureReceipt.roadmap_staged_reconciled = result.roadmap_staged_reconciled;
  }
  // #395.2: surface a resume-time roadmap convergence so the receipt is honest about the repair.
  if (result.roadmap_reconciled_on_resume) {
    closureReceipt.roadmap_reconciled_on_resume = true;
  }
  // #336: surface keep-open probe-truth warnings (issue already closed on the forge).
  if (keepOpenWarnings.length > 0) {
    closureReceipt.warnings = (closureReceipt.warnings || []).concat(keepOpenWarnings);
  }
  // M2 (#277 Phase 2): WARN-FIRST attestation check.
  // archiveProjectDir runs first (line ~863) and renames the live folder to result.dest,
  // so the live cache is gone; check the archive candidate first, then live as fallback.
  const liveCacheDir = path.join(root, 'kaola-workflow', args.project, '.cache');
  const archiveCacheDir = result.dest ? path.join(result.dest, '.cache') : null;
  // #338: contractor self-attest back-fill (mirror of #280 --attest-planner-spawn).
  // The SubagentStart hook can miss a contractor dispatched into a linked worktree, and some
  // harnesses have no hook at all. When the contractor's OWN Step 8b invocation passes
  // --attest-contractor-spawn, back-fill a contractor entry so checkDispatchAttestations sees
  // it. Gated strictly on the flag: an inline main-session finalize (no flag) writes nothing —
  // the inline-bypass detector still fires. Warn-first: must NEVER block finalize.
  if (args.attestContractorSpawn) {
    try {
      const attestDir = archiveCacheDir || liveCacheDir; // archive rename already happened
      fs.mkdirSync(attestDir, { recursive: true });
      const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const entry = JSON.stringify({ ts, agent_type: 'contractor', agent_id: 'finalize-backfill', cwd: root });
      fs.appendFileSync(path.join(attestDir, 'dispatch-log.jsonl'), entry + '\n');
    } catch (_) { /* fail-open: attestation is warn-first */ }
  }
  checkDispatchAttestations([archiveCacheDir, liveCacheDir], closureReceipt);
  // n2 (#653 finding A): a non-empty ATTESTATION WARNING must not live only in stdout JSON —
  // transcribe it (and the two status fields) into the archived finalization-summary.md.
  if (result.dest) persistAttestationToSummary(result.dest, closureReceipt);
  // n5 (#653 finding D3): advisory selection-evidence probe, computed beside the attestation
  // probe using the same archive-then-live candidate order (archiveProjectDir already ran).
  closureReceipt.selection_evidence = probeSelectionEvidence([archiveCacheDir, liveCacheDir]);
  // #441: advisory goal_check — probe archive-dest first (plan was already renamed there),
  // then live location as fallback (crash-resume where archive did not complete).
  closureReceipt.goal_check = computeGoalCheck([
    result.dest,
    path.join(root, 'kaola-workflow', args.project)
  ]);
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
      closureInvariants: invariantResult.ok ? 'ok' : ('violations:' + invariantResult.violations.length),
      claimPlannerAttested: closureReceipt.claim_planner_attested,
      finalizeContractorAttested: closureReceipt.finalize_contractor_attested
    });
  }
  // #333: keep-worktree commit block MOVED here (commit-last) — after the ## Closure append so the
  // archive + roadmap removal + ## Closure all land in ONE `chore: archive` commit (the tree is then
  // clean, which the #217 second-finalize no-new-commit + #296 B1 re-entry asserts depend on).
  if (args.keepWorktree) {
    // When called from a linked worktree with --keep-worktree, commit the archive
    // so the feature branch HEAD no longer has the live folder (required by sink-merge guard).
    let mainRoot2, linkedRoot2;
    try {
      mainRoot2 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
      linkedRoot2 = fs.realpathSync(root);
    } catch (_) { mainRoot2 = null; }
    if (mainRoot2 && mainRoot2 !== linkedRoot2) {
      // #356: stage the archive bookkeeping, then commit ONLY on an explicit staged-changes
      // exit-code check. The prior try/commit-as-catch fired the commit even when the `git
      // rm`/`git add` THEMSELVES failed — committing whatever happened to be staged and discarding
      // the real staging error. Staging failures are now isolated and never cascade into a commit.
      try {
        execFileSync('git', ['-C', root, 'rm', '-r', '--cached', '--ignore-unmatch', '--', 'kaola-workflow/' + args.project],
          { encoding: 'utf8', stdio: 'inherit' });
      } catch (_) { /* staging (rm) failure — do NOT cascade into a commit */ }
      const candidatePaths = ['kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md'];
      // #426: for a keep-worktree linked run, archiveProjectDir wrote the archive to the linked
      // worktree (not main), so result.dest is within the linked worktree's working tree and
      // path.relative(root, result.dest) is a valid git-add path.
      if (result.dest) candidatePaths.unshift(path.relative(root, result.dest));
      else if (result.skipped === 'source-missing') candidatePaths.unshift(path.join('kaola-workflow', 'archive', args.project));
      const existingPaths = candidatePaths.filter(p => fs.existsSync(path.join(root, p)));
      if (existingPaths.length > 0) {
        try {
          execFileSync('git', ['-C', root, 'add', '-A', '--', ...existingPaths],
            { encoding: 'utf8', stdio: 'inherit' });
        } catch (_) { /* staging (add) failure — do NOT cascade into a commit */ }
      }
      // Explicit exit-code check: `git diff --cached --quiet` exits 1 IFF there are staged changes.
      let hasStaged = false;
      try { execFileSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'ignore' }); }
      catch (e) { if (e && e.status === 1) hasStaged = true; /* other status = diff error → do not commit */ }
      if (hasStaged) {
        execFileSync('git', ['-C', root, 'commit', '-m', 'chore: archive ' + args.project],
          { encoding: 'utf8', stdio: 'inherit' });
      }
    }
  }
  // #395.5 (D1): OPT-IN exit gate. The JSON is always emitted; --strict additionally makes the exit
  // code reflect the invariant verdict (exit 4 on ok:false) for an exit-code-gated caller. Without
  // --strict the exit stays 0 (contractor choreography + existing tests read the JSON, not $?).
  const strictFailCode = (args.strict && invariantResult && invariantResult.ok === false) ? 4 : undefined;
  output(Object.assign({ status: 'closed' }, result, {
    claim_label_removed: claimLabelRemoved,
    archive_state_stamped: archiveStateStamped,
    issue_disposition: issueDisposition,
    closure_receipt: closureReceipt,
    closure_invariants: invariantResult
  }), strictFailCode);
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

  const result = archiveProjectDirSafely(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
  if (!closureContract.archiveSucceeded(result)) {
    output({ released: false, result: 'refuse', project: folder.project,
      reason: result.reason || result.snapshot_error || (result.archive_incomplete ? 'archive_incomplete' : 'archive_refused'),
      detail: result.detail, missing: result.missing,
      reasoning: 'archival did not return an explicit success result; worktree, branch, and claim-label cleanup was not attempted.' }, 1);
    return;
  }
  try { removeWorktree(root, folder.project, folder); } catch (_) {}

  // In-place branch restore: if this project created a feature branch (NATIVE=0 path),
  // checkout base/default BEFORE deleting the feature branch (git refuses deleting current branch).
  const featureBranch = folder.branch;
  let restoreNote = '';
  if (featureBranch && branchExists(root, featureBranch)) {
    try {
      const cur = inPlaceHead(root);
      const dirty = treeDirty(root, [folder.project]);
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

  // #396.1: cmdRelease discarded clearAdvisoryClaim's return — the helper swallows every gh error,
  // so a FAILED remove-label printed `released:true` exit 0 with NO label field, while the "claim
  // cleared" comment was still posted (the comment lies; the label is still on). The next claim of
  // that issue then hits user_target_blocked with zero signal at release time. cmdFinalize computes
  // claim_label_removed; release must too — capture the status, surface it, and warn on non-removal.
  // #328: for a bundle project, clear advisory claim for every member; primary's status is canonical.
  let claimLabelRemoved;
  if (Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0) {
    for (const n of folder.issue_numbers) {
      const s = clearAdvisoryClaim(n, args.reason || 'discarded', folder.project);
      if (n === folder.issue_number) claimLabelRemoved = s;
    }
    if (claimLabelRemoved == null) claimLabelRemoved = 'failed';
  } else {
    claimLabelRemoved = clearAdvisoryClaim(folder.issue_number, args.reason || 'discarded', folder.project);
  }
  const releaseWarnings = [];
  if (claimLabelRemoved !== 'removed' && claimLabelRemoved !== 'skipped_offline') {
    releaseWarnings.push('claim label removal status: ' + claimLabelRemoved +
      ' — the workflow:in-progress label may still be on the issue; the next claim could hit user_target_blocked.');
  }
  output(Object.assign(
    { released: true, project: folder.project, claim_label_removed: claimLabelRemoved },
    result,
    restoreNote ? { restore_note: restoreNote } : {},
    releaseWarnings.length ? { warnings: releaseWarnings } : {}
  ));
}

function cmdStatus() {
  const root = getRoot();
  const all = readActiveFolders(root, { excludeClosedIssues: false });
  const active = [];
  const drift = [];
  const ctx = {
    ownSession: resolveSessionMarker(process.env),
    explicitResumeIssues: new Set(),
    coTenantSignal: process.env.KAOLA_COTENANT === '1',
    now: Date.now(),
    staleMs: adaptiveSchema.LANE_STALENESS_MS
  };
  for (const folder of all) {
    // #579: annotate each folder with its lane_bucket so operators can distinguish own/live/stale/ambiguous lanes.
    const classified = classifyLane(folder, ctx);
    const annotated = Object.assign({}, folder, { lane_bucket: classified.bucket, lane_bucket_reason: classified.reasoning });
    if (folder.issue_number != null && issueIsClosed(folder.issue_number)) {
      drift.push(annotated);
    } else {
      active.push(annotated);
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
  // #398.1/#398.2: refuse an unsafe branch (flag-injection) or a newline-bearing value (durable-state
  // field injection) BEFORE rewriting the persisted ## Sink branch field. patch-branch was a raw
  // writer — a `--branch $'main\nworktree_path: /tmp/EVIL\nissue_numbers: 1,2,3'` reclassified the
  // project as a forged 3-member bundle.
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

function cmdAuditLabels() {
  if (OFFLINE) { output({ stale: [], offline: true }); return; }
  const raw = ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url']);
  const stale = raw ? JSON.parse(raw) : [];
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
// depends on a `gh` round-trip: a network fault must never turn into an over-reap, so "cannot be
// probed ⇒ KEEP" degrades here to "never probes" — folder presence + local status is the whole
// signal.
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
      // (a) active-folder KEEP set (fs+local-status only — no gh round-trip).
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

// #676: the evidence files whose silent loss during archiving would drop finalization / per-node
// gate evidence. Enumerate the ones that ACTUALLY EXIST in the live SOURCE folder — this is the
// SOURCE-RELATIVE completeness set. A minimal project (only workflow-state.md) yields just that; a
// full adaptive run yields the frozen workflow-plan.md + workflow-state.md + finalization-summary.md
// + EVERY per-node .cache/*.md gate-evidence file; a fast run additionally may carry fast-summary.md.
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
function listSourceEvidenceFiles(srcDir) {
  const rels = [];
  for (const f of ['workflow-plan.md', 'workflow-state.md', 'finalization-summary.md', 'fast-summary.md']) {
    if (fs.existsSync(path.join(srcDir, f))) rels.push(f);
  }
  let cacheEntries = [];
  try { cacheEntries = fs.readdirSync(path.join(srcDir, '.cache')); } catch (_) { cacheEntries = []; }
  for (const name of cacheEntries) {
    if (name.endsWith('.md') && !ARCHIVE_CACHE_SIDECAR_MD.has(name)) rels.push(path.join('.cache', name));
  }
  return rels;
}

// #707: the run record that SURVIVES a gutted .cache/ — every `## Node Ledger` row whose status is
// `complete` was evidence-checked at close time (the per-node lifecycle refuses to close a node
// whose .cache/<node-id>.md is missing), so the ledger inside workflow-plan.md PROVES those
// evidence files were recorded during the run even when the folder being archived no longer holds
// them (the worktree-postured divergence: evidence written to the WORKTREE's live copy while the
// archiver reads the MAIN checkout's). Returns the expected `.cache/<id>.md` relative paths;
// [] when the folder has no parseable plan/ledger (legacy fast/full folders, discards, minimal
// fixtures) so plan-less archives are never affected. n/a / pending / in_progress rows carry no
// evidence obligation. Node ids are validated against the sanitizeNodeId grammar so a corrupted
// ledger cell can never smuggle a path segment into the required set.
function listRecordedNodeEvidence(dirPath) {
  let content;
  try { content = fs.readFileSync(path.join(dirPath, 'workflow-plan.md'), 'utf8'); } catch (_) { return []; }
  let ledger;
  try { ledger = parseLedger(content); } catch (_) { return []; }
  const rels = [];
  for (const [id, status] of ledger) {
    if (status === 'complete' && /^[A-Za-z0-9_-]+$/.test(id)) rels.push('.cache/' + id + '.md');
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
// evidence floor — plan / summary / fast-summary / node-evidence stay strictly source-relative —
// it is the single #426 archive-integrity invariant (a state-less source is malformed and must not
// be deleted before its archive is proven to carry the state file).
//
// #707 hardening (opt-in via opts.requireLedgerEvidence): a SOURCE-relative check is blind to a
// source that was ALREADY gutted before the copy — a faithful copy of an evidence-empty folder
// passes trivially, which is exactly how evidence-empty archives shipped. When the caller attests
// it is archiving a completed run (the sink transaction), the `## Node Ledger`'s complete rows are
// added to the required set, so an archive missing ledger-proven node evidence can NEVER pass —
// regardless of what the source currently holds. Off by default: finalize paths that archive
// minimal/legacy folders keep the unchanged source-relative contract.
function verifyArchiveComplete(srcDir, destDir, opts) {
  if (!fs.existsSync(destDir)) return { ok: false, missing: ['<dest>'], mismatched: [] };
  try {
    const srcRoot = fs.lstatSync(srcDir);
    const destRoot = fs.lstatSync(destDir);
    if (!srcRoot.isDirectory() || srcRoot.isSymbolicLink()
        || !destRoot.isDirectory() || destRoot.isSymbolicLink()) {
      return { ok: false, missing: [], mismatched: ['<root>'] };
    }
  } catch (_) { return { ok: false, missing: ['<root>'], mismatched: [] }; }
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
  // #707: ledger-proven node evidence is required in DEST even when the SOURCE no longer holds it.
  if (opts && opts.requireLedgerEvidence) {
    for (const rel of listRecordedNodeEvidence(srcDir)) required.add(rel);
  }
  for (const rel of sourceFiles.keys()) required.add(rel);
  const missing = [];
  const mismatched = invalid.slice();
  for (const rel of Array.from(required).sort()) {
    const dest = path.join(destDir, ...String(rel).split('/'));
    if (!fs.existsSync(dest)) { missing.push(rel); continue; }
    const expected = sourceFiles.get(rel);
    if (!expected) continue;
    let stat;
    try { stat = fs.lstatSync(dest); } catch (_) { missing.push(rel); continue; }
    if (!stat.isFile() || stat.isSymbolicLink()) { mismatched.push(rel); continue; }
    const digest = require('crypto').createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    if (stat.size !== expected.size || (stat.mode & 0o777) !== expected.mode || digest !== expected.digest) {
      mismatched.push(rel);
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

function cmdWorktreeFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
  assert(folder && folder.worktree_path, 'worktree-finalize: active folder has no worktree_path');
  copyDir(folder.project_dir, path.join(folder.worktree_path, 'kaola-workflow', folder.project));
  // #398.3: pathspec'd stage + commit. The prior inverted try/commit-as-catch staged the project
  // path but committed with NO pathspec — `git diff --cached --quiet` throws when ANY change is
  // staged, so a pre-staged UNRELATED file was swept into the `chore: finalize` commit. Mirror
  // cmdFinalize's keep-worktree block: stage only the project path, check staged-ness via an
  // explicit exit-code probe, then commit ONLY that pathspec.
  const projectPathspec = 'kaola-workflow/' + folder.project + '/';
  try {
    execFileSync('git', ['-C', folder.worktree_path, 'add', '--', projectPathspec], { stdio: 'inherit' });
  } catch (_) { /* staging failure — do NOT cascade into a commit */ }
  let hasStaged = false;
  try { execFileSync('git', ['-C', folder.worktree_path, 'diff', '--cached', '--quiet', '--', projectPathspec], { stdio: 'ignore' }); }
  catch (e) { if (e && e.status === 1) hasStaged = true; /* other status = diff error → do not commit */ }
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
  // #394: the STANDARD exit-3 lane archives the project BEFORE sink-merge runs, so the LIVE folder is
  // already gone — the old `!live → {updated:false, reason:'project archived'}` no-op'd the entire
  // fallback (sink-pr then crashed on the missing folder). Operate on the ARCHIVED state when present
  // so the fallback chain can flip sink:pr there; only a TRULY-missing project keeps updated:false.
  if (!fs.existsSync(projectDir(root, args.project))) {
    const archiveState = path.join(root, 'kaola-workflow', 'archive', args.project, 'workflow-state.md');
    if (fs.existsSync(archiveState)) {
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

function cmdWatchPr() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  if (OFFLINE) { output({ watched: 0, offline: true }); return; }
  let watched = 0;
  const warnings = [];
  const cleanups = [];
  const probeErrors = []; // #396.6: visible probe errors (a `gh pr view` failure was silently swallowed)
  const archiveRefusals = [];
  for (const folder of readActiveFolders(root, { excludeClosedIssues: false })) {
    // #396.6: bundle-aware --issue filter. The old `folder.issue_number !== args.issue` matched the
    // PRIMARY only → a bundle watched by ANY OTHER member silently no-op'd (`watched:0`). Match the
    // primary OR any bundle member.
    if (args.issue && folder.issue_number !== args.issue &&
        !(Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(args.issue))) continue;
    if (folder.sink !== 'pr' || !folder.pr_url) continue;
    let state = '';
    try {
      const raw = ghExec(['pr', 'view', folder.pr_url, '--json', 'state,number']);
      state = String(JSON.parse(raw).state || '').toUpperCase();
    } catch (e) {
      // #396.6: a `gh pr view` error was swallowed (`catch(_){continue}`) while still counting
      // watched:1 — a silent lie. Record the error and do NOT count this folder as watched.
      probeErrors.push({ folder: folder.project, pr_url: folder.pr_url, error: (e && e.message) ? e.message : String(e) });
      continue;
    }
    watched++;
    if (state === 'MERGED') {
      const archiveResult = archiveProjectDirSafely(root, folder.project, 'closed');
      if (!closureContract.archiveSucceeded(archiveResult)) {
        archiveRefusals.push({ folder: folder.project,
          reason: archiveResult.reason || archiveResult.snapshot_error || (archiveResult.archive_incomplete ? 'archive_incomplete' : 'archive_refused'),
          detail: archiveResult.detail, missing: archiveResult.missing });
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
          const s = clearAdvisoryClaim(n, 'pr merged', folder.project);
          if (n === folder.issue_number) claimLabelStatus = s;
        }
        if (claimLabelStatus == null) claimLabelStatus = 'failed';
      } else {
        claimLabelStatus = clearAdvisoryClaim(folder.issue_number, 'pr merged', folder.project);
      }
      // #333: observe the primary issue's state at archive time (a merged PR does NOT imply a
      // closed issue — no close keyword keeps the issue open, the keep-open PR-sink case). watch-pr
      // is online by construction (OFFLINE early-returns above); probeIssueState catches/degrades.
      const dispProbe = probeIssueState(folder.issue_number);
      const issueDisposition = dispProbe.state === 'closed' ? 'closed'
        : (dispProbe.state === 'open' ? 'kept-open' : 'unknown');
      // #369: bundle-aware truthful receipt. watch-pr is online by construction, so for a bundle we
      // probe EVERY member, bucket each (closed/unavailable/open — never silent-neither), and derive
      // a truthful token (all closed → already_closed; else `partial`, never `skipped_offline`).
      const isBundle = Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0;
      const mClosed = [], mFailed = [], mOpen = [];
      let mergedRemoteToken = dispProbe.state === 'closed' ? 'already_closed' : 'skipped_offline';
      if (isBundle) {
        for (const n of folder.issue_numbers) {
          const p = (n === folder.issue_number) ? dispProbe : probeIssueState(n);
          if (p.state === 'closed') mClosed.push(n);
          else if (p.state === 'unavailable') mFailed.push(n);
          else mOpen.push(n);
        }
        mergedRemoteToken = (mClosed.length === folder.issue_numbers.length) ? 'already_closed' : 'partial';
      }
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_number, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'closed' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        epoch_lineage_preserved: archiveEpochLineagePreserved(archiveResult),
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
      const liveCacheDir = path.join(root, 'kaola-workflow', folder.project, '.cache');
      const archiveCacheDir = archiveResult && archiveResult.dest ? path.join(archiveResult.dest, '.cache') : null;
      checkDispatchAttestations([archiveCacheDir, liveCacheDir], folderReceipt);
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      // #333: append the terminal receipt to the archived state. watch-pr archives into the MAIN
      // working tree without committing (today's behavior); the append lands inside the untracked
      // archive dir. Disposition is OBSERVATION-derived here (vs DECISION-derived on cmdFinalize).
      if (archiveResult && archiveResult.dest) {
        appendClosureBlock(archiveResult.dest, {
          issueDisposition: issueDisposition,
          claimLabelRemoved: claimLabelStatus,
          worktreeRemoved: worktreeRemoved,
          closureInvariants: folderInvariants.ok ? 'ok' : ('violations:' + folderInvariants.violations.length),
          claimPlannerAttested: folderReceipt.claim_planner_attested,
          finalizeContractorAttested: folderReceipt.finalize_contractor_attested
        });
      }
      cleanups.push({ folder: folder.project, claim_label_removed: claimLabelStatus, receipt: folderReceipt, closure_invariants: folderInvariants });
    } else if (state === 'CLOSED') {
      const archiveResult = archiveProjectDirSafely(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
      if (!closureContract.archiveSucceeded(archiveResult)) {
        archiveRefusals.push({ folder: folder.project,
          reason: archiveResult.reason || archiveResult.snapshot_error || (archiveResult.archive_incomplete ? 'archive_incomplete' : 'archive_refused'),
          detail: archiveResult.detail, missing: archiveResult.missing });
        continue;
      }
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
          const s = clearAdvisoryClaim(n, 'pr closed', folder.project);
          if (n === folder.issue_number) claimLabelStatus2 = s;
        }
        if (claimLabelStatus2 == null) claimLabelStatus2 = 'failed';
      } else {
        claimLabelStatus2 = clearAdvisoryClaim(folder.issue_number, 'pr closed', folder.project);
      }
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_number, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'abandoned' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        epoch_lineage_preserved: archiveEpochLineagePreserved(archiveResult),
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
      const liveCacheDir = path.join(root, 'kaola-workflow', folder.project, '.cache');
      const archiveCacheDir = archiveResult && archiveResult.dest ? path.join(archiveResult.dest, '.cache') : null;
      checkDispatchAttestations([archiveCacheDir, liveCacheDir], folderReceipt);
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      cleanups.push({ folder: folder.project, claim_label_removed: claimLabelStatus2, receipt: folderReceipt, closure_invariants: folderInvariants });
    }
  }
  const emit = { watched };
  if (warnings.length > 0) emit.warnings = warnings;
  if (cleanups.length > 0) emit.cleanups = cleanups;
  if (probeErrors.length > 0) emit.probe_errors = probeErrors; // #396.6: visible, no longer swallowed
  if (archiveRefusals.length > 0) emit.archive_refusals = archiveRefusals;
  output(emit, archiveRefusals.length > 0 ? 1 : 0);
}

// #416: pure helpers — extracted so they are directly unit-testable.
//
// isProbeDegraded: true when the online probe threw and set remoteIssueClosed='skipped_offline'
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
      // #395.1: a step that DIDN'T run passes `undefined` for its field; copying it would
      // overwrite emptyReceipt()'s seeded 'failed' default with `undefined`, so the field
      // VANISHES from the receipt JSON (fail-loud contract violation — roadmap_source_removed /
      // roadmap_regenerated disappear after a finalize crash). Skip undefined so seeded
      // defaults survive when a stage didn't populate the field.
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

const USAGE = 'usage: kaola-workflow-claim.js <claim|authoring-allowed|release|status|patch-branch|watch-pr|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|verify-sink|stale-worktree-check|stale-worktree-cleanup|legacy-worktree-cleanup|audit-labels|repair-labels|barrier-ref-sweep>\n'
  + '  flags: --project P [--json] [--force] [--strict] [--issue N] [--target-issue N] [--target-issues A,B] [--pr-number N]\n'
  + '         [--branch B] [--reason R] [--runtime claude|codex|opencode] [--sink merge|mr|pr] [--workflow-path adaptive|full|fast]\n'
  + '         [--keep-worktree] [--keep-open|--keep-issue-open] [--keep-branch] [--execute] [--archive] [--export]\n'
  + '         [--attest-planner-spawn] [--attest-contractor-spawn]\n'
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
    else process.stderr.write('kaola-workflow-claim: unknown_flag — ' + hint + '\n');
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
  if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();
  if (sub === 'stale-worktree-cleanup') return cmdStaleWorktreeCleanup();
  if (sub === 'legacy-worktree-cleanup') return cmdLegacyWorktreeCleanup();
  if (sub === 'worktree-finalize') return cmdWorktreeFinalize();
  if (sub === 'sink-fallback') return cmdSinkFallback();
  if (sub === 'verify-sink') return cmdVerifySink();
  if (sub === 'audit-labels') return cmdAuditLabels();
  if (sub === 'repair-labels') return cmdRepairLabels();
  if (sub === 'barrier-ref-sweep') return cmdBarrierRefSweep();
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
  claimBundle,
  claimExplicitBundle,
  claimExplicitTarget,
  claimProject,
  buildClaimAnchors,
  collectStale,
  defaultBranch,
  ghExec,
  isSafeBranchArg,
  assertSafeBranchArg,
  assertNoNewline,
  classifyWorktreeError,
  // #603: Codex dispatch-mode flag validation (value-literal + newline-injection guard).
  resolveCodexDispatchModeFlag,
  CODEX_DISPATCH_MODES,
  computeClosePendingFinalize,
  isProbeDegraded,
  removeBranch,
  removeBranchIfMerged,
  postAdvisoryClaim,
  cmdAuditLabels,
  cmdLegacyWorktreeCleanup,
  cmdRepairLabels,
  cmdStaleWorktreeCleanup,
  deriveRunPosture,
  getCoordRoot,
  mainRootFromCoord,
  resolveMainRoot,
  resolveSessionMarker,
  legacySiblingWorktreePathFor,
  projectNameForIssue,
  provisionWorktree,
  readActiveFolders,
  readPriorityConfig,
  removeWorktree,
  worktreePathFor,
  verifyImplPublished,
  verifyArchiveComplete,
  // #707: ledger-proven node-evidence enumeration — the run record that survives a gutted .cache/.
  listRecordedNodeEvidence,
  cmdVerifySink,
  closeIssueIdempotent,
  // #686: barrier-ref archive-time reap (sanitizeBarrierTag) + the legacy keep-set sweep
  // (sweepBarrierRefs, cmdBarrierRefSweep) — exported for direct unit coverage.
  sanitizeBarrierTag,
  sweepBarrierRefs,
  cmdBarrierRefSweep,
  // #700: terminal archive-metadata writers reused by sink-merge's SOLE-archiver finalize path.
  appendClosureBlock,
  persistAttestationToSummary
};
