#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getCoordRoot, mainRootFromCoord, resolveMainRoot, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants, defaultBranch, appendClosureBlock } = require('./kaola-workflow-claim.js');
// The porcelain classifier backs the dirty-worktree data-loss guard, which is a KEEP. It lives in
// the byte-identical schema, not in claim.js — claim.js only ever re-exported it.
const { parsePorcelainPaths, isParkedLanePath } = require('./kaola-workflow-adaptive-schema.js');
// #548: the canonical repo-kind discriminator (self-host npm vs consumer). run-chains.js requires
// no sink-merge symbol, so this is non-circular.
const { resolveChains } = require('./kaola-workflow-run-chains.js');
// Crash-safe durable write (tmp + fsync + rename) for the sink transaction journals. Base-named in
// all four trees (the cross-edition byte anchor), so the forge hand-ports carry this exact literal.
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');

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

// ---------------------------------------------------------------------------
// THE SINK REPORTS; THE ORCHESTRATOR OWNS THE OUTCOME — AND REPORTING MEANS STOPPING.
//
// A converted site does NOT merge and report. It **stops without merging**. That is not a
// softer refusal, it is the opposite of one: stopping leaves every option open — fix and
// re-run, file a pull request instead, or record a human decision to publish anyway —
// whereas merging forecloses all of them. Only stopping is verdict-free, because only
// stopping leaves the choice with the party entitled to make it.
//
// FOUR properties, at every converted site:
//   1. the MEASUREMENT completes and the finding is recorded DURABLY — a named field on
//      the sink receipt under `--sink` (the journal survives a non-terminal stop, which is
//      exactly when a converted finding exists), a typed envelope on the legacy path;
//   2. the sink STOPS, with nothing merged and nothing published;
//   3. the exit stays non-success — transport for an output-blind consumer, not a verdict;
//   4. a sanctioned proceed-path is named in the finding's operator_hint.
//
// What a KEEP site loses that a converted one keeps is property 4: proceeding past a
// dirty worktree, a failed push, or an incomplete archive destroys something, so there is
// no sanctioned proceed-path to offer. A converted finding is decision-input the
// orchestrator may legitimately overrule; a KEEP refusal is not.
//
// Every finding also lands on stderr immediately, and in `findings[]` on the emitted
// envelope. The shape follows adaptive-schema's evaluateChainReceipt finding — a typed
// `classification`, a `detail` array, an `operator_hint` — reusing the vocabulary that
// already exists (`chains_red` for the validation witness) where one fits.
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

// Attach the accumulated findings to an emitted envelope and write it. Attached ONLY when
// non-empty, so a run that found nothing emits byte-identical output to before. Applied at
// every sink emission — a KEEP-class refusal downstream of a finding must not swallow it.
function sinkEmit(payload, exitCode) {
  const out = sinkFindings.length ? Object.assign({}, payload, { findings: sinkFindings }) : payload;
  process.stdout.write(JSON.stringify(out) + '\n');
  if (exitCode != null) process.exitCode = exitCode;
}

// Where the run's record lives, newest-authority first: the recorded archive dest (possibly
// collision-suffixed), the plain archive, then the live folder. Returns null when the run has
// no folder on disk at all — the finding then rides stderr + the envelope only.
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

// #931: the collision the committed record did not name. archiveProjectDir writes to
// kaola-workflow/archive/<project>.archived-<ts>/ when kaola-workflow/archive/<project>/ already
// exists, leaves the pre-existing directory exactly where it was, and returns NO field saying so —
// only a `dest` whose STRING carries the suffix. The fact was therefore encoded and never stated:
// archive_dest, every archived_paths entry and the archive's own name all sit under the suffixed
// path, so a reader had to already know what produces `.archived-` before they could tell a
// collision happened, and the directory still holding the rest of the evidence was named nowhere at
// all. On 2026-08-03 that directory was UNTRACKED — the run's only copy — and the sink reported
// status:sinked at exit 0 beside it.
//
// Inferred HERE rather than returned from archiveProjectDir, and that is a cost decision, not a
// design preference: a return field is four copies of claim.js plus four of this file, where the
// inference is four of this file alone. It is sound because the sink always calls archiveProjectDir
// with suffix=undefined — both suffix sites then produce either the plain path or the plain path
// plus `.archived-<ts>`, so a dest that differs from the plain path IS the destination-exists branch
// and nothing else.
//
// THIS FUNCTION NEVER PROBES THE DISK. It is handed the answer, and that split is the whole
// correctness argument. Its first version asked `fs.statSync(plain).isDirectory()` right here, which
// is an EXISTENCE-ONLY AUDIT — the defect class #832 already names below at pruneSinkArchiveSkeleton:
// resolveSinkReceiptPath's last fallback returns the ARCHIVE receipt path when main holds no live
// folder, and writeSinkReceipt mkdir -p's it, so THE SINK ITSELF manufactures
// `kaola-workflow/archive/<project>/.cache/` before the finalize step runs. archiveProjectDir then
// suffixed around the sink's own skeleton, the probe saw a directory, and the sentence was committed
// and pushed over a run where nothing had collided: the directory had not existed, it held one
// transaction journal rather than an archive, and disposeSinkJournals deleted it moments later. Every
// clause was false — in the one record this disclosure exists to make true.
//
// Repo-relative, deliberately. closure-audit reads this same archived summary back and treats a
// bare-relative `.cache/...` token as a citation of THIS archive; naming the abandoned archive's
// CONTENTS in that form would report files missing from an archive that never held them — a second
// false statement inside the record this exists to make true. Returns null when there was no
// collision: a sentence printed either way carries no information, and the collision could then no
// longer be told from its absence.
function describeArchiveCollision(project, archiveDestRel, priorArchiveExisted) {
  if (!archiveDestRel || !priorArchiveExisted) return null;
  const plainRel = 'kaola-workflow/archive/' + project;
  if (archiveDestRel.replace(/\/+$/, '') === plainRel) return null;
  return plainRel + '/ already existed, so this run was archived to ' + archiveDestRel + '/ instead. '
    + 'The pre-existing directory was left exactly where it was — a SECOND archive standing for this '
    + 'project, no part of this one. What it holds, and whether the repository tracks it at all, is '
    + 'not recorded here: read it before treating this archive as the run\'s whole record.';
}

// Does a REAL archive stand at kaola-workflow/archive/<project>/? Existence does not answer that, and
// the gap between the two questions is the whole of this repair. Two things sit at that path without
// being archives:
//
//   THE SINK'S OWN SKELETON. resolveSinkReceiptPath's last fallback returns the ARCHIVE receipt path
//   when main holds no live folder, and writeSinkReceipt mkdir -p's it — so by the time the finalize
//   step runs, THIS SINK has manufactured `kaola-workflow/archive/<project>/.cache/` at the very path
//   the question is about, and disposeSinkJournals deletes it again minutes later. The same shape
//   arrives from a PRIOR attempt too: a resumed transaction reads its stale receipt out of that
//   directory, so the skeleton is already there before this run writes anything.
//
//   AN EMPTY DIRECTORY, which archives no evidence and collides with nothing.
//
// The suffix cannot stand in as the discriminator either — archiveProjectDir suffixes around the
// skeleton exactly as it would around a real archive, which is what made the first version of this
// disclosure fire over runs where nothing had collided.
//
// pruneSinkArchiveSkeleton encodes the same discrimination and its predicate is deliberately NOT
// reused verbatim: it demands an EMPTY `.cache/`, because it runs after the journals are disposed,
// and the journal is sitting there for the whole of the transaction this reports on. SINK_STAGE_SKIP
// is the same two basenames the staging excludes and disposeSinkJournals removes — one list, read
// here rather than restated.
//
// WHAT SINK_STAGE_SKIP HAS TO KEEP MEANING, because this reader now depends on it: every file the
// sink itself writes into a project `.cache/`. Adding a third journal without adding it there makes
// this predicate call the sink's own residue a pre-existing archive — the failure is silent, it is
// toward OVER-reporting, and it is the phantom disclosure above coming back. If you are adding a
// journal, you are touching this.
//
// Asked at the finalize step, beside the archiveProjectDir call whose destination it explains, and
// deliberately NOT captured earlier at transaction start: the suffix decision is made there, so an
// archive the merge step brought to main after this transaction opened is a real collision that an
// answer captured before the merge would have reported as none.
function realArchiveAtPlainPath(mainRoot, project) {
  const dir = path.join(mainRoot, 'kaola-workflow', 'archive', project);
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return false; }
  if (entries.length === 0) return false;
  if (entries.length > 1 || entries[0] !== '.cache') return true;
  try {
    return fs.readdirSync(path.join(dir, '.cache'))
      .some(name => !SINK_STAGE_SKIP.has(name) && !isAtomicWriteResidue(name));
  } catch (_) { return false; }
}

// The temp file adaptiveSchema.writeFileAtomicReplace strands when the process dies between its
// openSync and its renameSync. It unlinks the temp only on a CAUGHT error, so a hard kill leaves one
// behind — and in the #832 posture the directory it is stranded in is exactly the
// `kaola-workflow/archive/<project>/.cache/` the predicate above reads. That residue is PERMANENT:
// disposeSinkJournals unlinks two known basenames and pruneSinkArchiveSkeleton refuses a non-empty
// `.cache/`, so nothing removes it, and without this arm one torn write makes EVERY later sink for
// that project repeat the same false collision line into its own committed record.
//
// Keyed on the writer's invariant, not on a reconstruction of its name. It builds the temp as
// `path.join(dir, '.' + basename + '.' + pid + '.' + Date.now() + '.' + rand + '.tmp')`, and what is
// durable in that is a DOT-PREFIXED `.tmp` SIBLING; the pid/timestamp/random layout is the part free
// to change, so matching it would be a third hand-maintained form that rots. Nothing the workflow
// archives as run evidence is a dot-prefixed `.tmp`.
function isAtomicWriteResidue(name) {
  return name.startsWith('.') && name.endsWith('.tmp');
}

// The durable half for a sink that SUCCEEDS. A converted finding stops the run, so its durable
// home is the surviving receipt / the emitted envelope; what reaches this writer is the record a
// completed sink would otherwise leave nowhere — above all the post-rebase test result, which
// under `stdio: 'inherit'` scrolled past and was never written down when it was GREEN.
//
// `## Sink Findings` sits in the same finalization-summary.md, under the same presence-guarded /
// swallow-on-error discipline, as the `## Validation` and `## Changed Paths` sections the finalize
// report writes there — a measurement writer must never be able to fail the operation it reports
// on. Returns the absolute path written, or null when there was nothing to write.
//
// #931's archive_collision rides HERE and not on persistArchivedPathsToSummary, which early-returns
// on an empty staged-path list: a disclosure hung behind that gate goes silent on exactly the run
// whose whole archive band is gitignored (#832 q / #893 w10). It is a plain recorded measurement and
// deliberately NOT a finding — recordSinkFinding writes a FINDING line to stderr and a `findings`
// key onto the envelope, and (#700 c) drives this same collision asserting both are absent.
function persistSinkFindingsToSummary(destDir, postRebaseTests, archiveCollision) {
  if (!destDir) return null;
  if (!sinkFindings.length && !postRebaseTests && !archiveCollision) return null;
  try {
    const p = path.join(destDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { /* create-if-absent */ }
    if (/^## Sink Findings$/m.test(s)) return null; // idempotent across a crash-resumed re-entry
    const lines = ['## Sink Findings', ''];
    if (postRebaseTests) lines.push('post_rebase_tests: ' + postRebaseTests, '');
    if (archiveCollision) lines.push('archive_collision: ' + archiveCollision, '');
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

// The repo-relative paths currently STAGED under one pathspec. Read from the INDEX rather than from
// the working tree or from the caller's own list of what it believed it planted: that is what makes
// the #893 report unable to under-claim a file that rode in unnoticed, or over-claim one this sink
// never touched. Same excludes the add/commit use, so a journal kept out of the commit is kept out
// of the report too.
//
// `-z`, and split on NUL and NOTHING ELSE — the fourth site of the same normalization, kept identical
// to the three below. This list is not diagnostic: persistArchivedPathsToSummary writes it DURABLY
// into the archive, so a name it mangles is a false statement in the run's own permanent record. The
// plain `--name-only` stream C-quotes an embedded newline and emits a trailing space RAW (measured
// with `od -c`), so the `.trim()` here reported a file really named `notes.md ` as `.cache/notes.md` —
// a path that exists nowhere — and left the quoted form of the others in the archive verbatim.
function stagedPathsUnder(mainRoot, pathspec, excludes) {
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--name-only', '-z', '--', pathspec, ...(excludes || [])],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch (_) { return []; }
}

// #893's durable half. The sink commits its whole own-archive pathspec, and it cannot tell a file
// finalize mirrored from one nobody wrote — the archive is a copy of a folder that lives untracked
// in main and is committed nowhere, so git holds no record of what belongs, and no list of names
// could stand in for one when archives carry whatever artifacts a run happened to need. So the harm
// closed here is SILENCE, not the commit: every own-archive path that lands is NAMED, uniformly,
// and the orchestrator adjudicates.
//
// This is the half that outlives the process. The envelope is stdout and the crash-resume journal is
// disposed on success, so a reader months from now has only the archived summary. It shares
// persistSinkFindingsToSummary's `## Sink Findings` section, adding that header only when the
// findings writer did not already emit one. It NEVER creates the summary: a report that invented a
// file inside the archive would add exactly the kind of unaccounted path it exists to disclose —
// and, because it only ever appends to a file the add already swept, it cannot change the path set
// it just reported. Same presence-guarded / swallow-on-error discipline as every other measurement
// writer here: this must never be able to fail the operation it reports on. Returns true iff written.
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
    const block = lines.join('\n').trimEnd() + '\n';
    adaptiveSchema.writeFileAtomicReplace(p, s.trimEnd() + '\n\n' + block);
    return true;
  } catch (_) { return false; }
}

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

// Does the branch tip still carry a LIVE run folder — i.e. was the run never finalized?
//
// CONVERTED: this threw. Whether an unfinalized run folder should block publication is a judgement
// about the state of the work, not a guard against destroying anything — nothing is lost by the
// sink declining to act on it, and two remediations have always existed. So the measurement stays
// and the wording changes: a typed finding, a durable record, and a named way forward. The sink
// still STOPS, with nothing merged: publishing a branch whose run never finalized would commit live
// run state onto the mainline, and stopping keeps every remedy available.
//
// Returns the recorded finding, or null when the branch carries no live folder. The name is the
// stable exported symbol and is retained deliberately.
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

// Does this branch carry any implementation beyond kaola-workflow/** bookkeeping?
//
// CONVERTED: "the work does not count" is a judgement about the work, and a docs-only or
// roadmap-only branch is a legitimate deliverable the sink is not entitled to rule on. The
// measurement is untouched (the same `git diff --name-only base...branch`, the same
// all-under-kaola-workflow/ test, the same skip when the base is unresolvable or the diff fails —
// cannot judge, do not report); what changes is that the answer is now typed, durable, and carries
// a way forward instead of dying as a bare Error string.
//
// The sink still STOPS. An empty branch is very often a run that lost its implementation commit,
// and publishing it forecloses noticing that; stopping costs one re-run and keeps every option.
//
// Returns the recorded finding, or null when the branch does carry implementation / nothing
// could be measured. The name is the stable exported symbol and is retained deliberately.
function assertBranchHasNonWorkflowChanges(mainRoot, branch, defBranch) {
  const baseRef = 'origin/' + defBranch;
  let base;
  try {
    base = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--verify', baseRef],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return null; } // base missing → skip (same posture as merge-base skip-check)
  let files;
  try {
    // #907: `-z`, split on NUL and nothing else. Without it `diff --name-only` C-QUOTES a path
    // carrying a `"`, a `\`, a control character or a non-ASCII byte, and the `startsWith('kaola-
    // workflow/')` test below reads the leading quote and answers false — one such path made a
    // workflow-only branch look like it carried implementation, and the finding under-fired. The
    // `.trim()` goes with it and is the half that is NOT merely latent: `diff --name-only` does not
    // quote a trailing space (measured — `status --porcelain` does, so the two need different
    // handling), so the trim silently renamed the path. That matters here more than at the other
    // readers of this shape, because this list does not only classify: `files` is written verbatim
    // into `workflow_only_files` on a RECORDED sink finding, so a mangled name lands on the receipt
    // as durable evidence and the operator is told to look for a file that does not exist.
    const out = execFileSync('git', ['-C', mainRoot, 'diff', '--name-only', '-z', base + '...' + branch],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
    files = adaptiveSchema.splitNulPaths(out);
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
      + 'is a legitimate deliverable and the route for it is a pull request — run sink-pr for this '
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
    // #397.2: after a conflict re-run, attempt 1 already pushed the PRE-rebase tip, so a plain
    // `git push` is guaranteed a non-fast-forward rejection. The correct push is force-with-lease.
    'Push before merging: git push --force-with-lease origin ' + branch + '\n' +
    '(a plain `git push` is rejected non-fast-forward if attempt 1 already pushed a pre-rebase tip).\n\n' +
    'Unpushed commits:\n  ' + commits.split('\n').join('\n  ')
  );
}

// Step 4 — post-rebase validation MEASUREMENT. Skipped OFFLINE (callers own their own validation)
// or under the #350 test-gate-skip hook (so an integration test can exercise the re-rebase race
// without recursively running the whole suite).
//
// CONVERTED: this threw a bare Error on red, so the one measurement bound to the exact post-rebase
// bytes died as an untyped stack trace with nothing written down. What changes is the vocabulary
// and the durability, NOT whether the sink stops: a red suite still stops the sink with nothing
// merged, because merging anyway would land an unattended red tree on the mainline unread, while
// stopping leaves a stalled unmerged branch — the same terminal state as the old refusal, minus the
// lie, plus a durable record and a named way forward.
//
// The result is recorded EITHER WAY. Under `stdio: 'inherit'` a green run scrolled past and left no
// trace at all, so "the chains were green over the merged content" was not a fact anyone could
// recover afterwards. Returns { result: 'green' | 'red' | 'skipped', finding } — `skipped` covers
// OFFLINE, the test-gate hook, and a consumer repo with no chains to run, which are three different
// reasons for the same honest answer: no measurement was taken.
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
  if (res && res.error) return { result: 'skipped', finding: null }; // consumer repo — no chains to run.
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

// Steps 3–4: rebase onto origin/<defBranch> and run post-rebase tests. Returns the test-gate
// outcome so the caller can STOP on red — this function never decides, it only reports upward.
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
    return runTestGate(mainRoot);
  }
  // No rebase, so no post-rebase measurement exists to report. This has always been the common
  // case — the gate only ever ran when the base had moved — so "a red suite blocks the merge" was
  // never true of a sink whose branch was already on top of the default branch.
  return { result: 'skipped', finding: null };
}

// Steps 5–6: FF-only merge loop with retry on race.
// #350: the default branch is resolved (defBranch), not hardcoded as 'main', and on an FF
// failure the feature branch is RE-REBASED onto the updated origin tip before retrying — the
// only race that makes an FF fail is origin/<defBranch> advancing after the initial rebase, and
// the pre-#350 loop retried the IDENTICAL ff-only merge without re-rebasing (so it could never
// succeed for its own target race — the loop was dead weight). On final failure the main root is
// restored to the default branch (the FF attempts leave it on the feature branch).
//
// Returns { merged: true, testGate }, or { merged: false, reason, testGate } naming WHICH way the
// loop ended — three different classes that must never be reported as one:
//   'non_fast_forward' — the fast-forward kept failing. Not a CONVERT: nothing about the work was
//     judged, so no vocabulary changed hands. It still STOPS with a non-success exit like every
//     other outcome, and it still emits a TYPED envelope, because an output-blind consumer cannot
//     act on a bare exit code — and the resolutions it names are real (another lane merged first).
//   'rebase_conflict'  — a real content conflict re-rebasing onto the advanced base. Stops bare:
//     a true conflict is never auto-resolved, and the sink cannot sanction a resolution for it.
//   'chains_red'       — the re-taken post-rebase measurement came back red. CONVERTED, and it
//     must surface under its OWN name: this arm used to `return false` into giveUp, which then
//     printed "FF race: exhausted retries" — reporting a red suite as a merge race. That is not a
//     wording problem, it is the sink telling the operator the wrong thing happened.
// `testGate` carries the most recent post-rebase measurement so a caller can record it either way.
function ffMergeLoop(args, mainRoot, defBranch) {
  let retries = 0;
  let forcedFailCount = 0;
  let testGate = { result: 'skipped', finding: null };

  const giveUp = (reason) => {
    // Only the genuine race prints the race message. A converted stop says what it actually found.
    if (reason !== 'chains_red') {
      process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
      process.stderr.write('Manual resolution: ensure no concurrent pushes to ' + defBranch + ' and re-run sink-merge.\n');
    }
    try { execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' }); } catch (_) {}
    return { merged: false, reason, testGate };
  };

  // Re-fetch + re-rebase the feature branch onto origin/<defBranch>, then re-measure the test gate
  // (the base moved). Returns a reason string when the loop must end, or null to keep going.
  const reRebaseFeature = () => {
    if (OFFLINE) return null; // no origin to re-rebase against — retry the FF as-is.
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
      return 'rebase_conflict';
    }
    // The base moved, so the witness is re-taken over the new content. Red ends the loop under its
    // own name — never laundered into the race message above.
    testGate = runTestGate(mainRoot);
    return testGate.result === 'red' ? 'chains_red' : null;
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
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp('non_fast_forward');
      const endReason = reRebaseFeature();
      if (endReason) return giveUp(endReason);
      continue;
    }

    let mergeSuccess = false;
    try {
      execFileSync('git', ['-C', mainRoot, 'merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
      mergeSuccess = true;
    } catch (_) {
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp('non_fast_forward');
      const endReason = reRebaseFeature();
      if (endReason) return giveUp(endReason);
      continue;
    }

    if (mergeSuccess) return { merged: true, testGate };
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
  // The durable record for a legacy sink that reached the merge. A converted finding never gets
  // here — every one of them stops before the fast-forward — so what this writes is the
  // post-rebase test result, `green` included: under `stdio: 'inherit'` a green run left no trace
  // at all, which made "the chains passed over the merged content" unrecoverable afterwards.
  // Written AND committed BEFORE the push below, so the same push publishes it and the sink does
  // not leave the default branch dirty. Nothing to record → no file, no commit: byte-unchanged.
  const recordable = postRebaseTests && postRebaseTests !== 'skipped' ? postRebaseTests : null;
  if (recordable || sinkFindings.length) {
    const findingsPath = persistSinkFindingsToSummary(
      resolveRunRecordDir(mainRoot, args.project, null), recordable);
    if (findingsPath) {
      const rel = path.relative(mainRoot, findingsPath).split(path.sep).join('/');
      try {
        execFileSync('git', ['-C', mainRoot, 'add', '--', rel], { encoding: 'utf8' });
        execFileSync('git', ['-C', mainRoot, 'commit', '-m', 'chore: record the sink measurement for ' + args.project, '--', rel], { encoding: 'utf8' });
      } catch (_) { /* best-effort: the finding is on disk and on the envelope either way */ }
    }
  }
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
    // Atomic (tmp + fsync + rename): this is a crash-resume journal whose payload — the resolved
    // default branch and the full issue member set — CANNOT be re-derived once the live folder has
    // been archived. A torn receipt breaks the exit-3 fallback chain with nothing to recover from.
    adaptiveSchema.writeFileAtomicReplace(
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
  // The dispatch-attestation probe that ran here is gone with the mechanism it read: claim.js no
  // longer exports checkDispatchAttestations, and the closure receipt carries no attestation field
  // for it to fill. Calling a retired export was not a stale comment — it threw AFTER the merge had
  // already landed on the default branch, so the sink advanced main and then died reporting exit 1.
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
    sinkEmit(out);
    return { exitCode: 1 };
  }

  // #393a: surface where the member set came from (flag / state_fallback / none) so a caller can see
  // that a flag-less bundle sink derived its members from state rather than silently closing only the
  // primary.
  const emit = { status: 'merged', closure_receipt: receipt, closure_invariants: invariants };
  if (args.member_source) emit.member_source = args.member_source;
  sinkEmit(emit);
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

// #746: the finalize step fails LOUDLY on any incomplete archive. It used to also carry an
// allowlist of one benign `snapshot_error` ('state_missing' on a journal-only live dir); that
// field had exactly one producer, the epoch/authority preflight, and nothing sets it any more —
// the benign shape now simply reports a complete archive and is skipped without a special case.

// #429: write a sink-receipt.json atomically (temp+rename) to avoid corruption on crash. Routed
// through the shared primitive so the step journal gets the fsync + parent-dir fsync the local
// temp+rename lacked — without it the rename can settle while the bytes are still only in the page
// cache, which is exactly the crash this journal exists to survive.
function writeSinkReceipt(receiptPath, receipt) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  adaptiveSchema.writeFileAtomicReplace(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
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

// #429: locate the sink-receipt.json — live project .cache first, archive .cache fallback.
function resolveSinkReceiptPath(mainRoot, project) {
  const live = path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json');
  const archive = path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json');
  if (fs.existsSync(live)) return live;
  if (fs.existsSync(archive)) return archive;
  // A collision-suffixed archive (archive/<project>.archived-<ts>/) may hold the receipt: the
  // finalize step follows archiveProjectDir's actual dest, so a crash-resume must scan the suffixed
  // candidates too (newest suffix first — the suffix is a sortable timestamp). Same scan discipline
  // as readCurrentClaimTs; the exact prefix match cannot hit an unrelated project name.
  try {
    const archiveRoot = path.join(mainRoot, 'kaola-workflow', 'archive');
    const suffixed = fs.readdirSync(archiveRoot)
      .filter(name => name.startsWith(project + '.archived-')).sort().reverse();
    for (const name of suffixed) {
      const candidate = path.join(archiveRoot, name, '.cache', 'sink-receipt.json');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_) {}
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
      // #893: present-and-EMPTY from the start, exactly as removed_duplicates is. A consumer that
      // must tell "committed nothing under the archive" from "this sink does not report" cannot rely
      // on a field that is sometimes absent — the difference between an empty list and a missing one
      // is the silence the report exists to close.
      archived_paths: [],
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

// #907: does git treat this directory as a REPOSITORY BOUNDARY — a nested `.git` DIRECTORY, or a
// `.git` gitfile that actually RESOLVES (a linked worktree planted inside the archive)? At a boundary
// git collapses the whole directory into ONE `160000` gitlink and nothing beneath it can ever become
// a blob, which is a different fact from the `.git` entry merely being unstageable.
//
// THE QUESTION IS ABOUT THE OUTER REPOSITORY, NOT THE INNER ONE, and getting that backwards is how
// the first version of this got it wrong. `rev-parse --show-toplevel` run INSIDE the candidate asks
// the INNER repository where its work tree is, and the inner repository's own config can answer
// anything: `core.bare=true` errors with `must be run in a work tree`, and `core.worktree` pointing
// elsewhere answers with that other path. Both were read as "not a boundary" — while the OUTER git
// staged a `160000` gitlink for each, exactly as for a plain nested repo. Their siblings stayed in
// `required[]`, could never become blobs, and `git add -f` on them exits 128 `is in submodule`:
// `sink_incomplete` on every re-run with no operator remedy, which is the precise state this function
// exists to remove.
//
// So ask git's OWN resolver, from the OUTER repo, about the `.git` entry itself:
// `rev-parse --resolve-git-dir <dir>/.git` is "is this a valid repository, or a gitfile pointing at
// one" — the same question `git add` answers when it decides to collapse a directory. It cannot be
// misdirected by the inner repo's config because it never enters the inner repo's work tree.
//
// Measured against ground truth (what the outer repo actually stages into a HEAD-seeded scratch
// index) across TWELVE `.git` shapes — plain nested repo, `core.bare=true`, `core.worktree`
// elsewhere, both at once, a `.git` symlink to a real gitdir, a gitfile with a relative gitdir, a
// junk `.git` file, a broken gitfile, a dangling `.git` symlink, an empty `.git` directory, a `.git`
// directory missing HEAD, and no `.git` at all. It agrees with the outer repository on every one, in
// BOTH directions: it never calls a boundary where git commits the siblings (which would silently
// drop real evidence from the blob gate), and it never misses one where git collapses.
//
// Any probe fault answers "not a boundary", i.e. leaves the pre-existing breadth in place.
function isArchiveRepoBoundary(mainRoot, absDir) {
  try {
    execFileSync('git', ['-C', mainRoot, 'rev-parse', '--resolve-git-dir', path.join(absDir, '.git')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch (_) { return false; }
}

// #907: ONE walk, TWO answers — the files the archive commit OWES, and the repository boundaries that
// put files permanently out of its reach. They are produced together because they are the same walk's
// two outcomes for one directory, and computing them apart is how they would come to disagree.
//
// A boundary's SUBTREE is skipped whole, not just its `.git` entry. Skipping the entry alone kept
// walking the siblings the gitlink had already made unreachable, and demanding them was a refusal
// nothing could clear: `ls-tree -r` returns the gitlink and no blobs beneath it, `ls-files -o -i`
// reports nothing there so no force-add is even attempted, and a hand `git add -f` on one of those
// files exits 128 with `fatal: … is in submodule`. Every re-run reproduced it byte-identically, with
// nothing in the envelope naming the cause. The caller REPORTS what was skipped; see there.
function scanArchiveTree(mainRoot, archiveRel) {
  const required = [];
  const embeddedRepos = [];
  const walk = (absDir, relDir) => {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return; }
    // Probe only when a `.git` entry is actually present, so the ordinary archive costs no spawns.
    if (entries.some(e => e.name === '.git') && isArchiveRepoBoundary(mainRoot, absDir)) {
      embeddedRepos.push(relDir);
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const rel = relDir + '/' + entry.name;
      if (entry.isDirectory()) { walk(path.join(absDir, entry.name), rel); continue; }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (SINK_STAGE_SKIP.has(entry.name)) continue;
      required.push(rel);
    }
  };
  walk(path.join(mainRoot, archiveRel), archiveRel);
  return { required: required.sort(), embeddedRepos: embeddedRepos.sort() };
}

function requiredArchiveFiles(mainRoot, archiveRel) {
  return scanArchiveTree(mainRoot, archiveRel).required;
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

// #907: the archive entries git committed as SYMLINKS (`120000`) whose target the archive does NOT
// carry — i.e. the commit holds a pointer, and a fresh clone gets a broken one.
//
// WHY THE BLOB GATE CANNOT SEE THIS. `blobPathsUnder` asks `ls-tree --name-only`, which lists a
// `120000` entry by name exactly like a `100644` one, and `scanArchiveTree` deliberately admits
// symlinks into `required[]` (#901: a link IS staged, as a blob whose content is the target string,
// and excluding it once let a gitignored link read `archive_commit:"done"`). Both halves are right on
// their own, and together they answer "carried" for a link to somewhere the archive does not reach:
// `missingBlobs` comes back empty, `archive_commit` reads done, the sink reports `status: sinked` at
// exit 0, and the clone is a dangling pointer that `git status` calls clean. That is a GREEN VERDICT
// OVER CONTENT THAT DID NOT TRAVEL — the same failure class as the false green this issue is about,
// relocated one step downstream.
//
// A link is only a problem when its target is OUTSIDE the archive. A link to a sibling inside it
// travels with the archive and resolves in any clone, so it is left alone rather than reported.
// Resolution is LEXICAL (`readlink` + `path.resolve`), with a realpath comparison as a second chance:
// realpath alone cannot answer for a link that already dangles on this machine, which is exactly one
// of the cases that must be named.
//
// REPORTS, NEVER REFUSES. The one path that can put a link in the band is a RESCUE — the crash-resume
// move-aside, which relocates main's surviving live folder rather than losing it — and refusing over
// rescued evidence would destroy more than it protects. The bytes are not lost either; they remain at
// the link's own target on the machine that ran it. What was missing is the SAYING SO, so that is what
// this adds. Never throws: an unreadable entry is skipped rather than aborting the sink.
function symlinkTargetsOutsideArchive(mainRoot, archiveRel, commitish) {
  let records;
  try {
    records = execFileSync('git', ['-C', mainRoot, 'ls-tree', '-r', '-z', commitish, '--', archiveRel],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean);
  } catch (_) { return []; }
  const archiveAbs = path.join(mainRoot, archiveRel);
  let archiveReal = archiveAbs;
  try { archiveReal = fs.realpathSync(archiveAbs); } catch (_) {}
  const within = (p, root) => p === root || p.startsWith(root + path.sep);
  const out = [];
  for (const rec of records) {
    // `<mode> SP <type> SP <sha> TAB <path>`; `-z` never quotes the path.
    if (rec.indexOf('120000 ') !== 0) continue;
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const rel = rec.slice(tab + 1);
    if (!rel) continue;
    const linkAbs = path.join(mainRoot, rel);
    let target;
    try { target = fs.readlinkSync(linkAbs); } catch (_) { continue; }
    const resolved = path.resolve(path.dirname(linkAbs), target);
    let resolvedReal = resolved;
    try { resolvedReal = fs.realpathSync(resolved); } catch (_) {}
    if (within(resolved, archiveAbs) || within(resolvedReal, archiveReal)) continue;
    out.push(rel + ' -> ' + target);
  }
  return out.sort();
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

// #429: preflight — classify the dirty tree into three buckets and handle them.
// Returns { ok: true, stashRef, removedDuplicates } on success, or
// { ok: false, reason: 'sink_blocked', foreign_dirt: [...] } on foreign dirt, or
// { ok: false, reason: 'worktree_dirty', detail } on the #562 dirty/unprobeable worktree guard.
// INVARIANT: if foreign_dirt is non-empty, NO mutation occurs.
function sinkPreflight(mainRoot, project, branch, issueNumbers) {
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
    // porcelain v1: XY path (or XY old -> new for renames). The STATUS COLUMN is read here; the PATH
    // comes from the kernel's decoder.
    //
    // #907: this used to be a SECOND, divergent porcelain parser — `line.slice(3).trim()` plus its own
    // rename-arrow split — and unlike the kernel's it did not even unwrap git's C-quoting. So a path
    // carrying a `"`, a `\`, a control character, a leading/trailing space, or (default core.quotePath)
    // a non-ASCII byte arrived here as `"…"` and every classification below is a prefix/exact/regex
    // test that then answers no: the roadmap-source bucket, the project-state bucket, the sink-receipt
    // exemption, the #893 own-archive-mirror exemption and the worktree-path check all miss, and the
    // path falls through to foreignDirt — a `sink_blocked` refusal over the run's OWN archive evidence,
    // reproduced identically on every re-run, instructing the operator to "commit/stash/restore" a file
    // that is the very run record the pending archive_commit is about to land.
    // Converged on `parsePorcelainPaths`, fed ONE record at a time so the status column stays readable:
    // it decodes the quoting (rather than merely unwrapping it) and takes the rename DESTINATION, which
    // is what this loop always wanted. One rule, one wording — a divergence between the two parsers was
    // the whole defect.
    const xy = line.slice(0, 2);
    const decoded = parsePorcelainPaths(line);
    if (decoded.length === 0) continue;
    const filePath = decoded[0];

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
      // Verify byte-superset: the branch must carry this file.
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

    // #893: THIS sink's OWN archive mirror. On a linked run `cmdFinalize --keep-worktree` writes the
    // archive tree into the MAIN root and leaves it UNTRACKED there — cmdFinalize cannot stage a path
    // outside its own worktree, so archiveProjectDir (claim.js) defers the commit to this sink's own
    // archive_commit step. Bucket 2's list is live-path-only and never matched those paths, so the
    // documented finishing sequence (finalize --keep-worktree, then --sink) blocked itself on its own
    // output. Exempt it — but only after consulting the branch, and only for THIS project. EXISTENCE
    // and CONTENT are two separate questions and are asked separately, because a failed read is not
    // evidence of absence:
    //   NOT CARRIED by the branch → the observed shape (main holds the run's ONLY copy) → exempt
    //   carried and byte-equal → a duplicate of what the branch already carries → exempt
    //   carried and DIVERGENT → two archives disagree; fall through to bucket 3 and refuse loudly
    //     rather than let one side silently win
    //   carried but UNREADABLE → unverifiable, which is not the same fact as absent: fall through
    //     too. Reading every read fault as "absent" hands back exactly the divergent copies the arm
    //     above exists to catch, and it does so on a HEALTHY repo — a branch copy merely larger than
    //     GIT_MAX_BUFFER overflows the content read (ENOBUFS) with nothing corrupt anywhere. Left
    //     swallowed it is worse than a mis-classification: the divergence resurfaces past preflight
    //     as an unhandled `git checkout` error, a non-zero exit carrying no typed envelope at all.
    // The existence probe is bucket 2's `cat-file -e`: it interrogates the tree, emits no bytes of
    // its own to overflow, and still answers when the blob behind the path cannot be inflated. It
    // cannot express the divergence test — which is why the content read FOLLOWS it rather than
    // replacing it, and why neither probe alone is enough.
    // CLASSIFICATION-ONLY — `continue`, never projDuplicates. Bucket 2's action is fs.unlinkSync, and
    // main holds the run's only finalization-summary.md and mission-list.md; routing the mirror
    // through that removal would destroy the run record archive_commit is about to land. Every byte
    // stays on disk, and on a refusal this exemption mutates nothing at all.
    // Scoped on a SEGMENT BOUNDARY (the trailing '/'): a SIBLING project's archive tree stays
    // bucket-3, and so does a project-name prefix look-alike (kaola-workflow/archive/<project>-x/…)
    // that a boundary-less prefix test would silently swallow — the never-touches-another-project
    // invariant is unchanged. Untracked (??) only, as bucket 2 is: a tracked modification or deletion
    // under the archive path is a local edit to committed content, not finalize's mirror.
    const ownArchivePrefix = 'kaola-workflow/archive/' + project + '/';
    if (xy === '??' && filePath.startsWith(ownArchivePrefix)) {
      let branchHasPath = false;
      try {
        execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', branch + ':' + filePath],
          { stdio: ['ignore', 'ignore', 'ignore'] });
        branchHasPath = true;
      } catch (_) {}
      if (!branchHasPath) continue;
      let branchBytes = null;
      try {
        branchBytes = execFileSync('git', ['-C', mainRoot, 'show', archiveKey + ':' + filePath],
          { maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (_) {}
      let workBytes = null;
      try { workBytes = fs.readFileSync(path.join(mainRoot, filePath)); } catch (_) {}
      // Byte-equality is the ONLY thing that exempts a path the branch carries. A read that failed
      // leaves branchBytes null and can never satisfy this, so unverifiable falls through with
      // divergent — no continue: both stay foreign dirt below.
      if (branchBytes !== null && workBytes !== null && branchBytes.equals(workBytes)) continue;
    }

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

// #694/#705: the ONE keep-open intent derivation for the --sink transaction — reused by the finalize
// step (to scope roadmap-source retention), persistSinkClosureMetadata (the ## Closure disposition),
// and the terminal keep_open_verify guard. Defense-in-depth over three sources: the live
// --keep-issue-open flag, the receipt's recorded keep_open_requested, OR the workflow-state.md
// issue_action: comment_keep_open (mirrors postMergeCleanup's archived-state honor). Both the archived
// state (post-archive: archive_dest / the default archive path) AND the live folder (pre-archive, when
// the finalize step calls this before archiveProjectDir moves it) are probed; a missing file reads as
// no-signal, never an error. Whole-run posture: there is no per-member keep-open flag in the sink API.
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

// #700: persist the terminal metadata cmdFinalize writes — the ## Closure state block
// (appendClosureBlock) — into the archive dest, for a --sink that is the SOLE archiver (no prior
// cmdFinalize --keep-worktree already wrote it). Without this, the sink's own archiveProjectDir
// archives a folder with NO terminal metadata (a latent gap that bites exactly when the sink is the
// only archiver). The writer is presence-guarded / idempotent (a dest already carrying the block is
// a no-op), and the disposition/label/invariant fields are honestly PENDING here: the sink's own
// closure + verify steps (later) perform the real close and record the authoritative verdict.
//
// The ## Attestation block and the ## Expansion Rollup line are gone with the mechanisms behind
// them: claim.js retired persistAttestationToSummary and persistExpansionRollupToSummary, and a
// call to a retired export is not a stale comment — it throws, here on the sole-archiver path,
// after the merge has already landed.
//
// Fail-soft — metadata persistence must never abort an otherwise-successful sink; only a programmer
// error (a missing/renamed claim.js export, the #550 cross-edition drift class) rethrows.
function persistSinkClosureMetadata(mainRoot, args, sinkReceipt, archiveResult) {
  const dest = archiveResult && archiveResult.dest;
  if (!dest) return;
  try {
    const keepOpen = deriveSinkKeepOpen(mainRoot, args, sinkReceipt);
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

// #429: the main --sink transaction.
function runSinkTransaction(rawArgs, mainRoot, defBranch) {
  const args = rawArgs;

  // Resolve the receipt path and load/init the receipt.
  // newCycle=true means loadOrInitReceipt detected a stale prior-cycle receipt and reinit'd — the
  // stale file remains on disk (unmodified) so git checkout <branch> in the merge step does not
  // abort; the first disk write is therefore deferred to stepDone('merge').
  const loaded = loadOrInitReceipt(mainRoot, args.project, args.branch,
    args.issue, args.issueNumbers, defBranch, args.keepIssueOpen);
  const { receipt, newCycle } = loaded;
  // Reassignable: the finalize step's archiveProjectDir renames the live folder (receipt included)
  // into the archive dest — every later write must follow it there, or writeSinkReceipt's mkdirSync
  // resurrects a phantom empty live .cache/ and the authoritative receipt forks from the archive.
  let receiptPath = loaded.receiptPath;

  // Mirror the accumulated findings onto the journal on EVERY receipt write. The journal is the
  // in-flight record: a run that stops before the archive commit leaves it on disk, so a resumed
  // successor reads what this attempt found without ever having seen stdout.
  const stampFindings = () => { if (sinkFindings.length) receipt.findings = sinkFindings; };

  // THE DURABLE HALF OF A CONVERTED STOP. A converted site stops with nothing merged, so the
  // receipt journal — which only survives BECAUSE the run did not reach terminal success — is
  // exactly where its finding belongs. Named field + the findings array, then the typed envelope.
  //
  // #518: the first disk write is deferred past the merge-step checkout for a new-cycle reinit,
  // because the stale receipt may be a tracked file on both branches and rewriting it pre-checkout
  // makes `git checkout <branch>` abort. A stop BEFORE that checkout must honour the same rule —
  // the finding still reaches the caller on the envelope, which is the legacy path's durability
  // model too, so nothing is lost.
  const recordStopOnReceipt = (field, value) => {
    if (field) receipt[field] = value;
    receipt.updated_at = new Date().toISOString();
    stampFindings();
    if (newCycle && receipt.steps.merge !== 'done') return false; // pre-checkout: envelope only
    try { writeSinkReceipt(receiptPath, receipt); return true; } catch (_) { return false; }
  };

  // Helper: mark a step done and persist
  const stepDone = (step) => {
    receipt.steps[step] = 'done';
    receipt.updated_at = new Date().toISOString();
    stampFindings();
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
        // Both classes that reach here stop with zero mutation. sink_blocked (foreign dirt) and
        // worktree_dirty KEEP — proceeding would destroy the user's own uncommitted work, so there
        // is no proceed-path to offer.
        const out = {
          result: 'refuse',
          reason: preResult.reason || 'sink_blocked',
          ...(preResult.foreign_dirt ? { foreign_dirt: preResult.foreign_dirt } : {}),
          detail: preResult.detail
        };
        sinkEmit(out, 1);
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
          sinkEmit({
            result: 'refuse',
            reason: 'sink_incomplete',
            step: 'push_upstream',
            push_upstream: 'failed',
            branch: args.branch,
            detail: '`git push -u origin ' + args.branch + '` did not verifiably reach parity with its upstream — the feature branch may not be backed up on the remote. Refusing to report status:sinked. The push_upstream step is left NOT done so a re-run retries it. Resolve the push fault (or push manually: git push -u origin ' + args.branch + ') and re-run --sink.',
          }, 1);
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
      // The post-rebase measurement. Red STOPS the sink here, before the fast-forward: the merge
      // has not happened, nothing is published, and the merge step stays NOT done so a re-run after
      // a fix resumes exactly here. This is the same terminal state the old throw produced — the
      // difference is that the result is now typed, named on the receipt, and carries a way out.
      let testGate = doRebase(args, alreadyUpToDate, mainRoot, defBranch);
      if (testGate.result === 'red') {
        recordStopOnReceipt('post_rebase_tests', 'red');
        sinkEmit({
          result: 'report',
          status: 'not_merged',
          reason: 'chains_red',
          step: 'merge',
          post_rebase_tests: 'red',
          branch: args.branch,
          default_branch: defBranch,
          detail: 'the post-rebase chains are RED over ' + args.branch + '. Nothing was merged into '
            + defBranch + ', nothing was pushed, and no issue was closed; the merge step is left NOT done '
            + 'so a re-run resumes here once the chains are green. Run sink-pr instead if the right call '
            + 'is to stage this for review.',
        }, 1);
        return;
      }
      const ffOutcome = ffMergeLoop(args, mainRoot, defBranch);
      // The FF loop can re-take the measurement after a race re-rebase; carry the newer result.
      if (ffOutcome.testGate && ffOutcome.testGate.result !== 'skipped') testGate = ffOutcome.testGate;
      if (!ffOutcome.merged) {
        receipt.merge = ffOutcome.reason;
        // chains_red is the CONVERTED arm and must surface under its own name. It used to `return
        // false` into giveUp, which printed "FF race: exhausted retries" — a red suite reported as
        // a merge race, which is not a wording problem but the sink naming the wrong cause.
        if (ffOutcome.reason === 'chains_red') {
          recordStopOnReceipt('post_rebase_tests', 'red');
          sinkEmit({
            result: 'report',
            status: 'not_merged',
            reason: 'chains_red',
            step: 'merge',
            post_rebase_tests: 'red',
            branch: args.branch,
            default_branch: defBranch,
            detail: 'the chains went RED on the re-rebased tree during fast-forward recovery — '
              + defBranch + ' had advanced, ' + args.branch + ' was rebased onto it, and the re-taken '
              + 'measurement failed. This is a red suite, NOT a merge race. Nothing was merged or pushed; '
              + 'the merge step is left NOT done so a re-run resumes here.',
          }, 1);
          return;
        }
        recordStopOnReceipt(null, null);
        if (ffOutcome.reason === 'non_fast_forward') {
          // A failed fast-forward stops like everything else, and it gets a typed envelope because
          // an output-blind consumer cannot act on a bare exit code. It is not a CONVERT — nothing
          // about the work was judged — but the resolutions are real and worth naming: this is the
          // ordinary consequence of another lane merging first.
          sinkEmit({
            result: 'report',
            status: 'not_merged',
            reason: 'non_fast_forward',
            step: 'merge',
            branch: args.branch,
            default_branch: defBranch,
            detail: 'branch ' + args.branch + ' did not fast-forward onto ' + defBranch + ' after '
              + MAX_AUTOMERGE_RETRIES + ' attempts. Nothing was merged, nothing was pushed and no issue '
              + 'was closed; the merge step is left NOT done so a re-run resumes here. Rebase onto the '
              + 'updated ' + defBranch + ' and re-run the sink (the normal answer when another lane '
              + 'merged first), resynchronize whatever diverged and re-run, or run sink-pr instead.',
          }, 2);
          return;
        }
        // rebase_conflict KEEPS its bare loud failure: a true content conflict is never
        // auto-resolved, and there is no resolution the sink could sanction on the operator's behalf.
        process.stderr.write('sink-merge --sink: FF merge failed after retries\n');
        process.exitCode = 2;
        return;
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
      stepDone('merge');
      continue;
    }

    if (step === 'finalize') {
      // Invoke archiveProjectDir from claim.js to archive the project. It is idempotent
      // (already_finalized early-return when archive exists).
      //
      // #899: the archive is CONFIRMED, never inferred. Set when an archive was required and did not
      // happen — an operational throw the catch below used to swallow, or a return that archived
      // nothing. The absence of a destination cannot be the discriminator: a source-missing return
      // (the keep-worktree flow, or a run with no live folder at all) leaves the receipt looking
      // exactly like a swallowed throw does, so keying on the missing dest would refuse two
      // legitimate no-ops. What separates them is what archiveProjectDir SAID it did.
      let archiveFailure = null;
      try {
        const { archiveProjectDir } = require('./kaola-workflow-claim.js');
        // #705: this sink is the SOLE archiver (no prior cmdFinalize passed keepRoadmapSource). If
        // keep-open is in force, archiveProjectDir would otherwise remove kaola-workflow/.roadmap/
        // issue-N.md for an issue that stays OPEN — dropping an open issue from the ROADMAP.md mirror.
        // Derive keep-open with the same three-source derivation the terminal keep_open_verify guard
        // uses, then scope roadmap-source retention to the kept-open member set via excludeIssues
        // (whole-run posture → every member when keep-open is in force; a closing run keeps none, so
        // the source is removed exactly as before). Read the LIVE state here (pre-archive).
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
        // happened; `skipped: 'source-missing'` is the only report that none was required. Anything
        // else — a bare `archived: false` with a reason (the forced-refusal seam reaches success by
        // RETURN rather than by throw, so a fix written at the catch alone would leave that door
        // open), a null from a port that returned nothing — archived nothing while a live folder
        // was there to archive, and the sink must not walk on to push and close over it. That test
        // is the closure contract's archive boundary, which every other destructive caller already
        // crosses through — take it from there rather than restating it, so the sink cannot drift
        // away from the wording the rest of the workflow archives by.
        const { archiveSucceeded } = require('./kaola-workflow-closure-contract');
        if (!archiveSucceeded(archiveResult)) {
          archiveFailure = {
            reason: (archiveResult && archiveResult.reason) || 'archive_not_performed',
            detail: (archiveResult && archiveResult.detail)
              || ('archiveProjectDir returned without archiving: ' + JSON.stringify(archiveResult)),
          };
        }
        // #700: carry the ACTUAL archive destination (possibly collision-suffixed to
        // archive/<project>.archived-<ts>/ when archive/<project>/ already exists) through the
        // receipt, so archive_commit stages/commits the exact dir — not a hardcoded plain path that
        // stages nothing — and disposeSinkJournals / the receipt-exclusion pathspec target it too.
        // A source-missing return (the keep-worktree flow already archived + committed on the branch)
        // has no dest; archive_commit then falls back to the plain path (already at HEAD post-merge).
        if (!archiveFailure && archiveResult && archiveResult.dest) {
          receipt.archive_dest = path.relative(mainRoot, archiveResult.dest).split(path.sep).join('/');
          // #700: this sink is the SOLE archiver — persist the same ## Closure + ## Attestation blocks
          // cmdFinalize writes (real attestation probe, no fabrication) so the archive is not left
          // without terminal metadata. No-op when the dest already carries them (keep-worktree flow).
          persistSinkClosureMetadata(mainRoot, args, receipt, archiveResult);
          // The rename just moved the live receipt into the dest — follow it, so stepDone('finalize')
          // and every later step write the archived copy instead of resurrecting the live path.
          receiptPath = path.join(archiveResult.dest, '.cache', 'sink-receipt.json');
        }
      } catch (e) {
        // #555: a missing/renamed export (TypeError) or undefined reference (ReferenceError) is a PROGRAMMER
        // error (the #550 cross-edition export-drift class — a forge port could omit archiveProjectDir) and
        // must fail LOUD, not be masked into a silent skip of the project archive. That arm is unchanged:
        // it keeps failing on its own terms, naming the vanished symbol in the stack.
        if (e instanceof TypeError || e instanceof ReferenceError) throw e;
        // #899: everything else used to be swallowed whole. An EACCES on kaola-workflow/archive/ — a
        // directory the process cannot write to, nothing else about the repo broken — left the archive
        // undone, the receipt without a dest, and the transaction free to walk on through push_main and
        // closure: the sink pushed the live run record the archive was supposed to take off the mainline,
        // closed the issue, and reported status:sinked. The throw is now RECORDED rather than dropped.
        archiveFailure = { reason: 'archive_exception', detail: e && e.message ? e.message : String(e) };
      }
      // #899: an archive that was required and did not happen stops the sink here, before push_main and
      // closure. This is not a verdict about the WORK — it is the destroy-class carve-out: the run record
      // is still live on the mainline and the sink may not CLAIM an archive it did not perform. Nothing
      // was deleted (the failure is at the archive itself), the finalize step is left NOT done, and the
      // journal survives, so a re-run against a writable directory resumes exactly here.
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
      // The durable record for a sink that will SUCCEED, written HERE and nowhere later: this is
      // the last point before archive_commit stages the archive, so the section rides the sink's
      // own commit and survives a fresh clone. What it carries is the post-rebase test result —
      // including `green`, which under `stdio: 'inherit'` previously scrolled past and was written
      // down nowhere, so nobody could afterwards tell a green measurement from one never taken.
      // Runs on both archiver postures: the sole-archiver dest the step just created, and the
      // keep-worktree archive the merge brought to the default branch.
      //
      // #931: and the collision, when this step's archiveProjectDir was pushed off the plain path by
      // a directory that was already there. Written at THIS moment because it is the last one before
      // archive_commit stages the archive, so the sentence rides the sink's own commit — the archive
      // dest is set, and no staged-path list has to be non-empty for it to land. WHETHER there was a
      // collision is realArchiveAtPlainPath's question, not an existence check — by now this sink has
      // very likely created that directory itself.
      persistSinkFindingsToSummary(resolveRunRecordDir(mainRoot, args.project, receipt.archive_dest),
        receipt.post_rebase_tests || null,
        describeArchiveCollision(args.project, receipt.archive_dest,
          realArchiveAtPlainPath(mainRoot, args.project)));
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
      // committed into main. Scoped to the ACTUAL dest (the plain path missed a suffixed one).
      // Exclude BOTH the archive-dest journals AND the live-folder journals: the resolved receipt
      // path can sit in the live project .cache (which the sole-archiver staging below sweeps via
      // livePathspec), and a journal must never be committed into the tracked tree (#520).
      //
      // MATCHED BY BASENAME AT ANY DEPTH, and that is the fix, not a generalization for its own sake.
      // These were four EXACT paths, each naming `<prefix>/.cache/<journal>` — exactly one directory
      // deep. #906's crash-resume backstop moves main's surviving live folder to
      // `<archive>/<project>/.orphan-main-live-<ts>/`, so its journals land ONE LEVEL DEEPER than any
      // of them and every mechanism that should have caught it stayed silent: the exact pathspecs do
      // not match, `SINK_STAGE_SKIP` drops the journals from `required[]` so the blob gate has nothing
      // to report, and the broad `git add -- <projectPathspec>` below then takes them. Measured with
      // this exact pathspec set: three journals staged, including one sitting directly in the archive
      // root. They are the one class of file the workflow declares must never be committed anywhere,
      // and `claim.js`'s SINK_JOURNAL_RE has always said so BY BASENAME AT ANY DEPTH — these four
      // pathspecs were the only place that rule was written as a fixed depth, so this converges them
      // on it rather than inventing a rule. `:(exclude,glob)…/**/<name>` is what expresses it: `**/`
      // spans zero or more directories, so the pre-#906 depth-1 paths stay covered and depth 0 and
      // depth 2+ join them. Measured against the plain `*/` form, which misses depth 0. Nothing else
      // moves: the same six real-evidence files stage under both the old and the new set.
      const excludeJournalsUnder = prefix => [
        ':(exclude,glob)' + prefix + '**/sink-receipt.json',
        ':(exclude,glob)' + prefix + '**/sink-fallback.json',
      ];
      const [excludeReceipt, excludeFallback] = excludeJournalsUnder(projectPathspec);
      const [excludeLiveReceipt, excludeLiveFallback] = excludeJournalsUnder('kaola-workflow/' + args.project + '/');
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
      const archiveScan = fs.existsSync(archiveDir)
        ? scanArchiveTree(mainRoot, archiveRel)
        : { required: [], embeddedRepos: [] };
      let requiredPaths = archiveScan.required;
      if (requiredPaths.length > 0) {
        const ignoredByName = repoWideIgnoredNames(mainRoot, requiredPaths);
        requiredPaths = requiredPaths.filter(p => !ignoredByName.has(p.split('/').pop()));
      }
      // #907: an embedded repository inside the archive. Its contents are out of this commit's reach
      // for good — git records the directory as a gitlink and every lever that could force a file in
      // fails (see scanArchiveTree). Requiring them produced a `sink_incomplete` that no re-run and no
      // operator action reachable from here could clear, so they are no longer required. What replaces
      // the refusal is the INVENTORY, the same answer #832/#901 reached for the gitignored archive:
      // the loss is itemized on the receipt and on stderr, with the one remedy that does work — and
      // that remedy lives outside git's index, which is exactly why the old refusal was unclearable.
      // Announced whenever the archive holds one, independent of whether this step commits anything.
      if (archiveScan.embeddedRepos.length > 0) {
        receipt.archive_embedded_repos = archiveScan.embeddedRepos.slice();
        process.stderr.write('sink-merge --sink: WARNING: ' + archiveScan.embeddedRepos.length
          + ' path(s) under ' + archiveRel + ' are embedded git repositories (a nested .git directory, or a '
          + 'linked worktree): ' + archiveScan.embeddedRepos.join(', ') + '. git records each as a gitlink, '
          + 'so the run evidence beneath them is NOT committed with the archive and will not survive a fresh '
          + 'clone. To archive their contents, remove the repository boundary — delete the nested .git, or '
          + '`git worktree remove` the planted worktree — so they become ordinary files, then re-run the '
          + 'sink.\n');
      }
      let forcePaths = [];
      if (!archiveIgnored && requiredPaths.length > 0) {
        const ignoredHere = new Set(ignoredUntrackedUnder(mainRoot, projectPathspec));
        forcePaths = requiredPaths.filter(p => ignoredHere.has(p));
      }
      const commitPaths = (archiveIgnored ? [] : [projectPathspec])
        .concat(stagedRoadmap, liveTracked ? [livePathspec] : []);
      const excludes = [excludeReceipt, excludeFallback, excludeLiveReceipt, excludeLiveFallback];
      // The staging runs TWICE (once before the archived_paths report, once after the durable copy is
      // appended to the summary), so the ordinary sweep and the #901 forced sweep are one step. The
      // errors are RETURNED, never discarded: `git add <dir>` exits 1 whenever an ignored directory
      // sits under the pathspec — measured, and still true after that directory's files are in the
      // index — so the status alone is not a fault and must not become a refusal on its own. It is
      // routed into the per-path blob verdict below, the only place that can tell a harmless exit 1
      // from a partial add. That routing is exactly what `catch (_) {}` used to throw away.
      const stageArchive = () => {
        const errs = [];
        try {
          execFileSync('git', ['-C', mainRoot, 'add', '--', ...commitPaths, ...excludes], { encoding: 'utf8' });
        } catch (e) { errs.push('git add: ' + String((e && e.message) || e).trim()); }
        if (forcePaths.length) {
          try {
            execFileSync('git', ['-C', mainRoot, 'add', '-f', '--', ...forcePaths], { encoding: 'utf8' });
          } catch (e) { errs.push('git add -f: ' + String((e && e.message) || e).trim()); }
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
        // index AFTER the add and BEFORE the commit — the one moment the answer is knowable and
        // still changeable. Scoped to projectPathspec, so a SIBLING's archive residue (#715-exempt
        // at preflight, and never in commitPaths) is correctly absent: reporting a path this sink
        // never touched would be a different lie from staying silent about one it did.
        receipt.archived_paths = stagedPathsUnder(mainRoot, projectPathspec, excludes);
        // The durable copy has to be written before the commit that captures it, then re-staged so
        // the appended text rides that same commit instead of being left dirty behind it. The path
        // set cannot shift underneath the report: the writer only ever appends to a summary the add
        // already swept, and never creates one.
        if (persistArchivedPathsToSummary(archiveDir, receipt.archived_paths)) {
          addErrors = addErrors.concat(stageArchive());
        }
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
      // #907: and the question `missingBlobs` structurally CANNOT ask — is anything it just counted as
      // carried actually a POINTER to content the archive does not hold? A committed `120000` entry is
      // a blob, so it satisfies the gate above while a fresh clone gets a dangling link and `git
      // status` there reports clean. Measured unconditionally, for the same reason the blob gate is:
      // the posture that produces one (the crash-resume move-aside, the only path that puts a link in
      // the band) leaves `archive_dest` set or unset depending on the run, and gating on it would miss
      // half the cases. REPORT, NOT REFUSE — see the helper; this is a rescue path, and the bytes are
      // not lost, only unreachable from the archive. What changes is that the sink stops saying
      // "complete" without qualification when part of what it committed is a pointer outward.
      const unbackedLinks = symlinkTargetsOutsideArchive(mainRoot, archiveRel, 'HEAD');
      if (unbackedLinks.length > 0) {
        receipt.archive_unbacked_symlinks = unbackedLinks;
        process.stderr.write('sink-merge --sink: WARNING: ' + unbackedLinks.length + ' archived path(s) under '
          + archiveRel + ' are SYMLINKS committed as pointers to targets the archive does NOT carry: '
          + unbackedLinks.join(', ') + '. The commit holds the link, not the content, so a fresh clone '
          + 'resolves it only where those exact paths exist — elsewhere it dangles, and `git status` in '
          + 'that clone still reports clean. The bytes are intact at the target on this machine. To make '
          + 'them survive a clone, replace the link with a copy of its target inside ' + archiveRel
          + ' and re-run the sink.\n');
      }
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
          result: 'refuse',
          reason: 'sink_incomplete',
          step: 'archive_commit',
          archive_dest: archiveRel,
          branch: args.branch,
          default_branch: defBranch,
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
          result: 'refuse',
          reason: 'sink_incomplete',
          step: 'archive_commit',
          archive_dest: archiveRel,
          archive_missing_paths: missingBlobs,
          archive_add_errors: addErrors,
          branch: args.branch,
          default_branch: defBranch,
          detail: missingBlobs.length + ' required archive path(s) exist on disk under ' + archiveRel
            + ' but are NOT blobs in ' + defBranch + ' HEAD, so the run evidence would not survive a fresh clone: '
            + missingBlobs.join(', ') + '. Refusing to report status:sinked for a partially committed archive '
            + '(#901). The archive_commit step is left NOT done so a re-run retries it; the branch, the worktree '
            + 'and the on-disk archive are preserved.',
        }, 1);
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
          sinkEmit({
            result: 'refuse',
            reason: 'sink_incomplete',
            step: 'push_main',
            push_main: 'failed',
            branch: args.branch,
            default_branch: defBranch,
            detail: 'the merge landed on the LOCAL ' + defBranch + ' but `git push origin ' + defBranch + '` failed — the deliverable is NOT on the remote. Refusing to report status:sinked (a transient push failure must not look like a completed sink). The push step is left NOT done so a re-run retries it. Resolve the push fault and re-run --sink.',
          }, 1);
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
          // cwd matters: main() chdirs to os.tmpdir() before the transaction, and gh resolves its
          // target repo from the invoking cwd — a bare {} makes every probe/reopen silently no-op.
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
            sinkEmit({
              result: 'refuse',
              reason: 'sink_incomplete',
              step: 'closure',
              remote_issue_closed: 'partial',
              closed_issues: closed.sort((a, b) => a - b),
              failed_issue_closures: failed.sort((a, b) => a - b),
              branch: args.branch,
              detail: 'the merge landed but ' + failed.length + ' issue(s) could not be closed on the forge (' + failed.join(', ') + '). Refusing to report status:sinked. The closure step is left NOT done so a re-run retries it. Manually close the issue(s) or resolve the forge fault, then re-run --sink.',
            }, 1);
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
  let merged = false;
  try {
    execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', args.branch, defBranch], { encoding: 'utf8', stdio: 'ignore' });
    merged = true;
  } catch (_) { merged = false; }
  if (!merged) {
    sinkEmit({
      result: 'refuse',
      reason: 'stale_sink_receipt',
      branch: args.branch,
      default_branch: defBranch,
      detail: 'all sink steps report "done" but branch "' + args.branch + '" is NOT an ancestor of "' + defBranch + '" — the merge was never applied (a stale receipt resumed from kaola-workflow/archive/' + args.project + '/.cache/sink-receipt.json). Refusing to report status:sinked (main would silently not advance and the deliverable would be lost). Reset the receipt steps or remove the stale archived sink-receipt.json, then re-run --sink so the branch actually merges.',
    }, 1);
    return;
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
    // #705: ONE derivation, shared with the finalize step + persistSinkClosureMetadata (never a
    // fourth variant). At this terminal point the live folder is already archived, so the helper's
    // live-state candidate simply reads as no-signal; the archived-state candidates carry the intent.
    const keepOpen = deriveSinkKeepOpen(mainRoot, args, receipt);
    // Trust the push_main #517 reopen when it already ran this invocation (receipt already records
    // reopened_after_autoclose): that is the DESIGNATED reopen point. This terminal guard is a
    // BACKSTOP for paths that SKIPPED push_main — a stale/resumed receipt where the #517 reopen never
    // ran — so it only re-probes + refuses when push_main did not already handle the auto-close.
    if (!OFFLINE && keepOpen && args.issue != null && receipt.remote_issue_closed !== 'reopened_after_autoclose') {
      let stillClosed = false;
      try {
        // cwd matters here too (same reason as the push_main #517 reopen): the transaction runs
        // from os.tmpdir(), so a bare {} would make this guard a permanent no-op against real gh.
        if (probeIssueClosed(args.issue, { cwd: mainRoot })) {
          try { reopenIssue(args.issue, { cwd: mainRoot }); } catch (_) {}
          stillClosed = probeIssueClosed(args.issue, { cwd: mainRoot });
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
        sinkEmit({
          result: 'refuse',
          reason: 'sink_incomplete',
          step: 'keep_open_verify',
          keep_open_requested: true,
          remote_issue_closed: 'failed',
          issue: args.issue,
          branch: args.branch,
          detail: 'keep-open was in force but issue #' + args.issue + ' is CLOSED on the forge after push (a close-keyword commit likely auto-closed it) and could not be reopened. Refusing to report status:sinked — a kept-open epic must not be silently retired. Reopen the issue (or resolve the forge fault), then re-run --sink.',
        }, 1);
        return;
      }
    }
  }

  try {
    const { removeWorktree: removeWt, readActiveFolders: readAF } = require('./kaola-workflow-claim.js');
    const folder = readAF(mainRoot, { excludeClosedIssues: false }).find(f => f.project === args.project);
    removeWt(mainRoot, args.project, folder);
  } catch (_) {}

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
  // A successful sink still carries its findings: green is not the same as nothing-found, and the
  // journal that held them is gone by now — the archived `## Sink Findings` is what outlives this.
  sinkEmit({ result: 'ok', status: 'sinked', journal_disposed: journalDisposed, receipt: finalReceipt });
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
    sinkEmit({ result: 'refuse', reason: 'unknown_flag', unknownFlags: args.unknownFlags, operator_hint: hint }, 1); return;
  }
  // #429: detect --sink flag before routing to the transaction.
  const isSinkMode = rawArgv.includes('--sink');
  assert(
    args.branch && !args.branch.startsWith('-') && !args.branch.includes('\0') &&
    args.branch !== '.' && args.branch !== '..',
    '--branch is invalid'
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
  // (operates on mainRoot / the branch ref, not the working tree), and every one of them stops the
  // sink with ZERO mutation and the worktree intact.
  //
  // Two kinds stop here and the difference is what the operator is owed, not whether it stops. The
  // KEEP guards — assertCleanWorktree, assertBranchPushedToUpstream, assertWorktreeClean — protect
  // work that proceeding would destroy or lose, so they throw and offer no sanctioned way past. The
  // CONVERTED ones — assertNoLiveWorkflowFolder and assertBranchHasNonWorkflowChanges — judge the
  // state of the work, so they emit a typed envelope carrying a named finding and a route forward.
  // This path has no step journal, so the envelope IS the durable record; that is why each of these
  // emits rather than throwing.
  assertCleanWorktree(mainRoot, [args.project]);
  const liveFolderFinding = assertNoLiveWorkflowFolder(mainRoot, args.project, args.branch);
  if (liveFolderFinding) {
    // A CONVERTED precondition: the vocabulary is a report, not a refusal, because the orchestrator
    // may legitimately overrule it. The sink still STOPS — nothing merged, nothing published.
    sinkEmit({
      result: 'report',
      status: 'not_merged',
      reason: 'run_not_finalized',
      branch: args.branch,
      project: args.project,
      detail: liveFolderFinding.detail[0],
    }, 1);
    return;
  }
  if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);
  if (!OFFLINE) {
    const emptyBranchFinding = assertBranchHasNonWorkflowChanges(mainRoot, args.branch, defBranch);
    if (emptyBranchFinding) {
      // CONVERTED, same shape as above: report vocabulary, stop without merging.
      sinkEmit({
        result: 'report',
        status: 'not_merged',
        reason: 'no_implementation_changes',
        branch: args.branch,
        default_branch: defBranch,
        workflow_only_files: emptyBranchFinding.workflow_only_files,
        detail: emptyBranchFinding.detail[0],
      }, 1);
      return;
    }
  }
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

  // The post-rebase measurement, taken before the fast-forward so a red result stops with nothing
  // merged. This path has no step journal, so the typed envelope is the durable record.
  let testGate = doRebase(args, alreadyUpToDate, mainRoot, defBranch);
  if (testGate.result === 'red') {
    sinkEmit({
      result: 'report',
      status: 'not_merged',
      reason: 'chains_red',
      post_rebase_tests: 'red',
      branch: args.branch,
      default_branch: defBranch,
      detail: 'the post-rebase chains are RED over ' + args.branch + '. Nothing was merged into '
        + defBranch + ', nothing was pushed, and no issue was closed.',
    }, 1);
    return;
  }

  const ffOutcome = ffMergeLoop(args, mainRoot, defBranch);
  if (ffOutcome.testGate && ffOutcome.testGate.result !== 'skipped') testGate = ffOutcome.testGate;
  if (!ffOutcome.merged) {
    // chains_red is the CONVERTED arm and surfaces under its own name — it used to be laundered
    // into giveUp's "FF race: exhausted retries", reporting a red suite as a merge race.
    if (ffOutcome.reason === 'chains_red') {
      sinkEmit({
        result: 'report',
        status: 'not_merged',
        reason: 'chains_red',
        post_rebase_tests: 'red',
        branch: args.branch,
        default_branch: defBranch,
        detail: 'the chains went RED on the re-rebased tree during fast-forward recovery. This is a '
          + 'red suite, NOT a merge race. Nothing was merged or pushed.',
      }, 1);
      return;
    }
    if (ffOutcome.reason === 'non_fast_forward') {
      // Typed envelope for the same reason the --sink path emits one: a bare exit code is not
      // something an output-blind consumer can act on. Not a CONVERT — nothing about the work was
      // judged — but the resolutions are real and named.
      sinkEmit({
        result: 'report',
        status: 'not_merged',
        reason: 'non_fast_forward',
        branch: args.branch,
        default_branch: defBranch,
        detail: 'branch ' + args.branch + ' did not fast-forward onto ' + defBranch + ' after '
          + MAX_AUTOMERGE_RETRIES + ' attempts. Nothing was merged, nothing was pushed and no issue was '
          + 'closed. Rebase onto the updated ' + defBranch + ' and re-run the sink (the normal answer '
          + 'when another lane merged first), resynchronize whatever diverged and re-run, or run '
          + 'sink-pr instead.',
      }, 2);
      return;
    }
    // rebase_conflict stops bare: a true content conflict is never auto-resolved.
    process.exitCode = 2;
    return;
  }

  const cleanupResult = postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch, testGate.result);
  // #619(1): postMergeCleanup can now also return { exitCode: 1 } (a failed-close sink_incomplete
  // refusal) alongside the pre-existing { exitCode: 3 } (merge-impossible fallback) — generalize
  // from the exact-3 check to any returned exitCode.
  if (cleanupResult && cleanupResult.exitCode) { process.exitCode = cleanupResult.exitCode; return; }
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = { classifyMergeError, assertBranchHasNonWorkflowChanges };
