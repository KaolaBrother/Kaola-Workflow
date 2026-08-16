#!/usr/bin/env node
'use strict';

// Closure-audit (issue #165, child of closure-system-v2 epic #161).
//
// Reports "closure drift" — completed work that still shows as active — across:
//   (c) closed remote issues still carrying the workflow:in-progress label
//   (e) an active folder exists for a closed issue (report only)
//   (f) an active sink=pr folder whose PR is merged/closed but was never archived (report only)
//
// ADR 0018 §5: the local-roadmap-mirror classes — (a) stale kaola-workflow/.roadmap/issue-N.md
// sources for closed issues, (b) the generated ROADMAP.md still listing closed issues, and (d)
// archive workflow-state.md says closed but the .roadmap source survives — are retired. There is no
// local roadmap source or mirror left for a closure to leave stale.
//
// Dry-run JSON is the default. `--execute` repairs only SAFE local drift: it removes the
// in-progress label from closed issues when online. It NEVER deletes active
// folders or worktrees — that surface belongs to stale-worktree-check /
// stale-worktree-cleanup. Classes (e) and (f) are report-only in both modes.
//
// The audit is repository-wide by DEFAULT and stays that way. `--project`/`--issue` add a scoped
// verdict on top: the repository sweep still runs whole, and the report partitions it into the
// requested project's drift and everything else, so out-of-scope drift can never contaminate the
// scoped verdict and can never be hidden by it either.
//
// Dedicated script (not a claim.js subcommand) mirroring kaola-workflow-sink-merge.js:
// it inlines its own ghExec/parseArgs/assert and imports only domain helpers.
// Byte-identical copy lives in plugins/kaola-workflow/scripts/ (validate-script-sync.js).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  field,
  getRoot,
  issueIsClosed,
  isSafeName,
  probeIssueState,
  readActiveFolders
} = require('./kaola-workflow-active-folders');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CLAIM_LABEL = 'workflow:in-progress';
// #987: same clamp, same absence of a pin, same reason — and note this constant is NOT the one
// `probeIssueState` reads (that is the identically-named one in kaola-workflow-active-folders.js).
// Mutating this one moves neither timeout test, which is what made the original diagnosis land on the
// wrong module. See the tombstone in simulate-workflow-walkthrough.js.
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function ghExec(args, opts) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
}

const USAGE = [
  'usage: kaola-workflow-closure-audit.js [--project <name>] [--issue <N>] [--execute]',
  '       kaola-workflow-closure-audit.js --help',
  '',
  'Reports closure drift as JSON. Repository-wide and dry-run by default.',
  '',
  '  --project <name>  Scope the verdict to one workflow project. Its member issues are read from',
  '                    that project\'s own workflow-state.md, live or archived.',
  '  --issue <N>       Add issue N to the scope. Repeatable.',
  '  --execute         Repair safe local drift (currently: the in-progress label). Scoped, only',
  '                    scoped findings are repaired.',
  '  --help, -h        Print this usage and exit 0.',
  '',
  'Scoped runs add scope, current_project_clean, current_project_drift and',
  'repository_drift_outside_scope. current_project_clean is false whenever a scoped class could',
  'not be evaluated (offline, or timed out), and whenever --project resolved to no record (reported',
  'as scope.project_unresolved): what did not run never reads clean.',
  ''
].join('\n');

// #903: the pre-#903 loop recognized the exact string `--execute` and had no `else`, so `--help` and
// every mistyped or invented flag was absorbed silently and answered with the full repository report
// at exit 0. An operator who believed they had scoped the audit got an unscoped answer that looked
// authoritative. Unknown flags and missing values now throw (main turns that into stderr + exit 1),
// and `--help` prints usage at exit 0 — the shape kaola-workflow-classifier.js already uses.
function parseArgs(argv) {
  const args = { execute: false, help: false, project: null, issues: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') { args.execute = true; continue; }
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    if (a === '--project') {
      const v = argv[++i];
      assert(v !== undefined && !v.startsWith('-'), '--project requires a project name');
      // A project is ONE folder name under kaola-workflow/, never a path. `--project ../../outside`
      // resolved a workflow-state.md from OUTSIDE the repository and reported a verdict on it at exit
      // 0 — the same operator-input error class as a mistyped flag, so it answers the same way.
      // isSafeName is claim.js's and the sinks' own rule, reused rather than restated.
      assert(isSafeName(v), '--project must be a safe folder name, got: ' + v);
      args.project = v;
      continue;
    }
    if (a === '--issue') {
      const v = argv[++i];
      const n = parseInt(v, 10);
      assert(Number.isInteger(n) && n > 0 && String(n) === String(v).trim(),
        '--issue requires a positive issue number, got: ' + (v === undefined ? '<missing>' : v));
      args.issues.push(n);
      continue;
    }
    throw new Error('unknown flag: ' + a + '\n\n' + USAGE);
  }
  return args;
}

// Archive folder names come in three shapes — `P`, `P.archived-<ts>` and `P.discarded-<ts>` — so a
// project's own archive is matched by exact name or by one of those two suffixes. Never a bare
// prefix: that would also swallow an unrelated `P-extra`.
function archiveNameMatchesProject(name, project) {
  return name === project
    || name.startsWith(project + '.archived-')
    || name.startsWith(project + '.discarded-');
}

// The `issue_numbers` line is a bundle's member carrier and `issue_number` is its scalar primary.
// Both survive into the archived copy of workflow-state.md, so one reader serves live and archived
// folders alike. The primary is always included, even when no `issue_numbers` line was written (a
// single-issue run deliberately suppresses it).
function stateIssueNumbers(content) {
  const out = [];
  const raw = field(content, 'issue_numbers');
  if (raw) {
    for (const part of raw.split(',')) {
      const n = parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n > 0 && out.indexOf(n) === -1) out.push(n);
    }
  }
  const primary = parseInt(field(content, 'issue_number'), 10);
  if (Number.isInteger(primary) && primary > 0 && out.indexOf(primary) === -1) out.push(primary);
  return out.sort((a, b) => a - b);
}

// Resolve a project's member issues from its OWN record: the live folder first, then its archive
// under any of the three name shapes (oldest name first, so an exact bare name wins over a
// timestamped sibling). Returns resolved:false when the project has no workflow-state.md anywhere.
function resolveProjectIssues(root, project) {
  const workflowDir = path.join(root, 'kaola-workflow');
  const archiveBase = path.join(workflowDir, 'archive');
  const candidates = [path.join(workflowDir, project, 'workflow-state.md')];
  let names = [];
  try {
    names = fs.readdirSync(archiveBase, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch (_) { names = []; }
  for (const name of names) {
    if (archiveNameMatchesProject(name, project)) candidates.push(path.join(archiveBase, name, 'workflow-state.md'));
  }
  for (const file of candidates) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    return {
      resolved: true,
      state_file: path.relative(root, file).split(path.sep).join('/'),
      issue_numbers: stateIssueNumbers(content)
    };
  }
  // #903: a bare `P` archive sitting beside a `P.archived-<ts>` sibling is ambiguous — one of them is
  // the archive and the other is residue, and neither folder says which. Reported, never guessed.
  return { resolved: false, state_file: null, issue_numbers: [] };
}

// Build the scope from the parsed flags, or null when none were passed (the repository-wide default).
function resolveScope(root, args) {
  if (!args.project && args.issues.length === 0) return null;
  const issues = new Set(args.issues);
  let stateFile = null;
  let ambiguous = false;
  let projectUnresolved = false;
  if (args.project) {
    const found = resolveProjectIssues(root, args.project);
    // An unresolvable --project must not answer "clean". Reporting a clean verdict for a mistyped
    // project name is exactly the silent-scoping failure this flag exists to remove.
    assert(found.resolved || args.issues.length > 0,
      'no workflow-state.md found for project "' + args.project + '" (looked in kaola-workflow/'
        + args.project + '/ and kaola-workflow/archive/' + args.project
        + '{,.archived-*,.discarded-*}/) — pass --issue <N> to scope by issue number instead');
    // MEASURED: with --issue given, the assert above lets an unresolvable --project through and the
    // run answered current_project_clean:true — a mistyped project name reading clean, which is the
    // failure the assert exists to prevent, reached by the escape hatch instead of past it. --issue
    // supplies issue numbers to scope BY; it does not supply the record the project name failed to
    // resolve, so the project half of the scope never evaluated. Carried out of here and read by the
    // verdict, so the answer is "the project did not resolve" rather than "the project is clean".
    projectUnresolved = !found.resolved;
    stateFile = found.state_file;
    for (const n of found.issue_numbers) issues.add(n);
    ambiguous = archiveNameIsAmbiguous(root, args.project);
  }
  return {
    project: args.project,
    issues,
    issue_numbers: Array.from(issues).sort((a, b) => a - b),
    state_file: stateFile,
    project_unresolved: projectUnresolved,
    archive_name_ambiguous: ambiguous
  };
}

// True when MORE THAN ONE archive folder matches the project. Then a name-matched archive finding
// cannot be attributed cleanly, and the scoped report says so rather than adopting one reading
// silently. It first required a bare `P` PLUS a suffixed sibling, which left the commonest residue
// pair invisible: two timestamped siblings and no bare `P` — MEASURED, the scope resolved its issues
// from one and attributed the other's finding to the same project as an unqualified `name_match`.
// Archive names come in three shapes, so the count is over archiveNameMatchesProject, not over one of
// them.
function archiveNameIsAmbiguous(root, project) {
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  let names;
  try {
    names = fs.readdirSync(archiveBase, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  } catch (_) { return false; }
  return names.filter(n => archiveNameMatchesProject(n, project)).length > 1;
}

// The ONLY caller of probeIssueState. One remote probe per distinct issue number
// (dedupe), so the gh-call count is O(distinct N), not O(detectors x N).
// probeIssueState self-guards OFFLINE (returns {state:'open', reason:'offline-or-null'}),
// so closed is empty offline. Timed-out probes go to unresolved.
function collectClosedSet(candidateNumbers) {
  const closed = new Set();
  const unresolved = [];
  const seen = new Set();
  for (const n of candidateNumbers) {
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    const probe = probeIssueState(n);
    if (probe.state === 'closed') closed.add(n);
    else if (probe.state === 'unavailable') unresolved.push(n);
  }
  return { closed, unresolved };
}

// ADR 0018 §5: roadmapSourceFiles and archiveClosedIssues stood here — the .roadmap/issue-N.md
// scanner and the closed-archive-issue-number collector that fed detectStaleRoadmapSources'
// 'archive_closed' reason. Both are retired with the drift class they existed only to serve.

// (g) #832: prove archive CONTENT, not existence. `verifyArchiveComplete` cannot cover this class —
// it is SOURCE-relative and runs at copy time, before the loss; an archive gutted afterwards (the
// worktree that held it was deleted, or the sink's own receipt writer mkdir-ed a bare `.cache/`
// skeleton) passed every existing check and dropped silently out of the (now-retired)
// archiveClosedIssues, which `continue`d on any read error — this class exists independently of it.
//
// The required set is derived from the archive's OWN record, never a blanket demand: only
// workflow-state.md is unconditionally required (the #676 identity anchor).
//
// The second and third rules are GONE with the mechanism that made them derivable. They asked the
// state for a plan hash and then asked the plan's `## Node Ledger` which `.cache/<id>.md` files a
// `complete` row obliged; there is no ledger to ask, and a mission-list `result` is free text, not
// a file list. That is the same vanished-declaration this campaign meets everywhere, and inventing
// a replacement demand here would be a blanket rule wearing a derivation's clothes — it would flag
// two thirds of a mature archive corpus as drift. LOCAL and report-only either way: an incomplete
// archive is not repairable, so --execute reports it and never touches it.
function archiveRequiredContent(dir) {
  let state;
  try { state = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8'); } catch (_) { state = null; }
  if (state === null) return ['workflow-state.md'];
  return [];
}

function detectArchiveContentIncomplete(root) {
  const out = [];
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  if (!fs.existsSync(archiveBase)) return out;
  let entries;
  try { entries = fs.readdirSync(archiveBase, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const missing = archiveRequiredContent(path.join(archiveBase, entry.name));
    if (missing.length) out.push({ project: entry.name, missing });
  }
  return out.sort((a, b) => a.project.localeCompare(b.project));
}

// (h) #901: archiveRequiredContent above reads DISK ONLY, so it can require nothing beyond the
// identity anchor. An archive whose finalization-summary cites `.cache/final-validation.md` or
// `.cache/doc-updater.md` as its evidence, and does not contain it, therefore looks complete: the
// anchor is present and no rule asks whether the run's own citations resolve.
//
// The summary's citation IS the archive's own record of what it held — the same record-derived
// standard archiveRequiredContent applies, read from a second place. `.jsonl` append-logs are
// excluded because their disposal is a DOCUMENTED step (a stale release-receipt.jsonl must be
// deleted before the next release), so absence there is correct rather than lost.
//
// Report-only, like every archive class: the cited bytes are gone and nothing here can rebuild them.
//
// Precision, measured over this repo's 368-archive corpus (436 bare-relative citations across 118
// summaries): 4 archives flagged, 3 of them real losses. The fourth cites a receipt while naming, in
// the same sentence, the repository-root path it actually landed at — a prose mention is not a claim
// of presence, and no structural rule separates the two (section vocabulary predates the mission
// list, and one false positive sits under an ad-hoc heading). So this reports the citation and the
// operator adjudicates; it is never a verdict and never repairs.
function archiveCitedMissing(dir) {
  let summary;
  try { summary = fs.readFileSync(path.join(dir, 'finalization-summary.md'), 'utf8'); } catch (_) { return []; }
  const missing = [];
  const seen = new Set();
  // A bare-relative `.cache/...` token, delimited so an extension is never truncated (`.jsonl` must
  // not read as `.json`). Absolute paths and other projects' paths do not start at `.cache/`, so they
  // are not citations of THIS archive and never match.
  const re = /(?:^|[\s`(|])(\.cache\/[A-Za-z0-9._/-]*[A-Za-z0-9])/g;
  let m;
  while ((m = re.exec(summary)) !== null) {
    const rel = m[1];
    if (!/\.(?:md|json|txt)$/.test(rel)) continue;
    if (rel.indexOf('..') !== -1 || seen.has(rel)) continue;
    seen.add(rel);
    if (!fs.existsSync(path.join(dir, ...rel.split('/')))) missing.push(rel);
  }
  return missing.sort();
}

function detectArchiveSummaryCitationMissing(root) {
  const out = [];
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  if (!fs.existsSync(archiveBase)) return out;
  let entries;
  try { entries = fs.readdirSync(archiveBase, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const citedMissing = archiveCitedMissing(path.join(archiveBase, entry.name));
    if (citedMissing.length) out.push({ project: entry.name, cited_missing: citedMissing });
  }
  return out.sort((a, b) => a.project.localeCompare(b.project));
}

// ADR 0018 §5: detectStaleRoadmapSources ((a)+(d)) and detectMirrorClosed ((b)) stood here. Measured
// before retirement: mirror_lists_closed_issues' issue-number set was always a strict subset of
// stale_roadmap_sources' 'closed_remote'-reasoned entries — both read the identical
// kaola-workflow/.roadmap/issue-N.md sources (readRoadmapIssues over roadmapDir, the same directory
// roadmapSourceFiles scanned), and mirror_lists_closed_issues added no reason it wouldn't also flag
// under closed_remote. Retired together with the sources they read.

// (c): remote-dependent. 'skipped_offline' only when OFFLINE; online gh failure
// reports an empty array plus a stderr warning (not a skip).
function detectStaleLabels() {
  if (OFFLINE) return 'skipped_offline';
  try {
    const raw = ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url']);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      return 'skipped_timeout';
    }
    process.stderr.write('closure-audit: gh issue list failed; reporting empty stale_in_progress_labels\n');
    return [];
  }
}

// Scoped to the folder subtree (worktree if present, else the active folder).
// #563: an UNPROBEABLE tree (held index.lock, EAGAIN/EMFILE, corrupt repo) fails CLOSED = treated as
// DIRTY, mirroring #557/#496/#552 — a probe that cannot PROVE the subtree clean must not report clean
// (that would let a crashed/dirty closure be reported safe). A genuinely-ABSENT path (no worktree, no
// project dir) still reads not-dirty: absence is provable, not a probe fault.
function isDirty(folder) {
  if (folder.worktree_path && fs.existsSync(folder.worktree_path)) {
    try {
      const out = execFileSync('git', ['-C', folder.worktree_path, 'status', '--porcelain'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.trim().length > 0;
    } catch (_) { return true; } // #563: unprobeable → fail-closed (dirty)
  }
  if (folder.project_dir && fs.existsSync(folder.project_dir)) {
    try {
      const out = execFileSync('git', ['-C', folder.project_dir, 'status', '--porcelain', '--', '.'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.trim().length > 0;
    } catch (_) { return true; } // #563: unprobeable → fail-closed (dirty)
  }
  return false;
}

// (e): report only.
function detectActiveClosedFolders(folders, closedSet) {
  const out = [];
  for (const f of folders) {
    if (f.issue_number != null && closedSet.has(f.issue_number)) {
      out.push({ project: f.project, issue_number: f.issue_number, dirty: isDirty(f) });
      continue;
    }
    // #903: a bundle folder is drift as soon as ANY member issue is closed, not only its primary.
    // The primary keeps precedence above — that is the only case reachable before members were
    // probed, so its finding is byte-for-byte what it always was — and this arm names the lowest
    // closed member for the case that was previously invisible. One finding per folder either way.
    const closedMembers = (f.issue_numbers || []).filter(n => closedSet.has(n)).sort((a, b) => a - b);
    if (closedMembers.length) {
      out.push({ project: f.project, issue_number: closedMembers[0], dirty: isDirty(f) });
    }
  }
  return out;
}

// (f): remote-dependent, report only. 'skipped_offline' only when OFFLINE.
function detectUnarchivedPrFolders(folders) {
  if (OFFLINE) return 'skipped_offline';
  const out = [];
  for (const f of folders) {
    if (f.sink !== 'pr' || !f.pr_url) continue;
    let state = '';
    try {
      const raw = ghExec(['pr', 'view', f.pr_url, '--json', 'state']);
      state = raw ? String(JSON.parse(raw).state || '').toUpperCase() : '';
    } catch (err) {
      if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') return 'skipped_timeout';
      continue;
    }
    if (state === 'MERGED' || state === 'CLOSED') {
      out.push({ project: f.project, issue_number: f.issue_number, pr_url: f.pr_url, pr_state: state });
    }
  }
  return out;
}

// Single detection pass. executeRepairs consumes this; it never re-detects.
function buildAuditReport(root) {
  const folders = readActiveFolders(root, { excludeClosedIssues: false });

  // #903: readActiveFolders already supplies every folder's bundle members (issue_numbers) and this
  // set threw them away, so a bundle's non-primary issues were never probed at all — measured with a
  // positive control. Members now enter the candidate set alongside the scalar primary; collectClosedSet
  // dedupes, so the remote-probe count stays O(distinct N).
  // ADR 0018 §5: the roadmap-source issue numbers this set used to fold in are gone with
  // roadmapSourceFiles — the two classes they only fed are retired.
  const candidates = folders.map(f => f.issue_number).filter(n => n != null)
    .concat(folders.reduce((acc, f) => acc.concat(f.issue_numbers || []), []));
  const { closed: closedSet, unresolved } = collectClosedSet(candidates);

  const staleLabels = detectStaleLabels();
  const activeClosed = detectActiveClosedFolders(folders, closedSet);
  const unarchivedPr = detectUnarchivedPrFolders(folders);
  // #832: LOCAL — no remote probe, so it reports identically offline.
  const archiveIncomplete = detectArchiveContentIncomplete(root);
  // #901: LOCAL for the same reason — it reads the archived summary and the archived files.
  const citationMissing = detectArchiveSummaryCitationMissing(root);

  const drift = {
    stale_in_progress_labels: staleLabels,
    active_folder_for_closed_issue: activeClosed,
    unarchived_pr_folders: unarchivedPr,
    archive_content_incomplete: archiveIncomplete
  };
  // #901: OMITTED WHEN EMPTY, exactly like unresolved_closed_state below. A new class must not change
  // the repository-wide envelope on a repo that has none of it — the default report is unchanged.
  if (citationMissing.length > 0) {
    drift.archive_summary_citation_missing = citationMissing;
  }
  if (unresolved.length > 0) {
    drift.unresolved_closed_state = unresolved;
  }
  return { offline: OFFLINE, drift, counts: driftCounts(drift) };
}

// One count per drift key, in the drift object's own insertion order. A non-array value is a
// 'skipped_offline'/'skipped_timeout' class, which counts 0 findings — its skip reason is readable in
// `drift`, where it cannot be mistaken for a measurement.
function driftCounts(drift) {
  const counts = {};
  for (const key of Object.keys(drift)) {
    counts[key] = Array.isArray(drift[key]) ? drift[key].length : 0;
  }
  return counts;
}

// Split a drift report into the scoped project's findings and everything else. BOTH halves are
// emitted: out-of-scope drift must not contaminate the scoped verdict, and must not be hidden by it.
function partitionDriftByScope(drift, scope) {
  const inScope = {};
  const outScope = {};
  for (const key of Object.keys(drift)) {
    const value = drift[key];
    if (!Array.isArray(value)) {
      // A skipped or timed-out class lands in both halves verbatim: it never evaluated, so neither
      // half is entitled to report it clean.
      inScope[key] = value;
      outScope[key] = value;
      continue;
    }
    const keep = scopePredicate(key, scope);
    inScope[key] = value.filter(keep).map(f => annotateAttribution(key, f, scope));
    outScope[key] = value.filter(f => !keep(f));
  }
  return { inScope, outScope };
}

// The in-scope test per drift class. Issue-keyed classes test the scope's issue set; the two archive
// classes can only test the folder NAME, because the artifact they report missing is itself the
// record that would carry an issue number. The default arm covers the folder-keyed classes by SHAPE
// rather than by name, so the GitLab port's unarchived_mr_folders needs no separate entry — and any
// finding carrying neither a matching project nor a scoped issue falls to the out-of-scope half,
// where an operator still sees it.
function scopePredicate(key, scope) {
  if (key === 'unresolved_closed_state') return n => scope.issues.has(n);
  if (key === 'stale_in_progress_labels') return f => scope.issues.has(f.number);
  if (key === 'archive_content_incomplete' || key === 'archive_summary_citation_missing') {
    return f => scope.project != null && archiveNameMatchesProject(f.project, scope.project);
  }
  return f => (scope.project != null && f.project === scope.project) || scope.issues.has(f.issue_number);
}

// Stamp HOW a name-matched archive finding was attributed. `ambiguous_name_match` says more than one
// archive folder matches the project, so one of them is residue and the folders do not say which.
// Scoped output only — the repository-wide findings pass through verbatim. The test is the same
// name-shape match the scope predicate used to pull the finding in: keyed on the bare project name it
// stamped only the bare-`P` half of an ambiguous pair, so a timestamped sibling — the half that is
// residue more often than not — read as an unqualified `name_match`.
function annotateAttribution(key, finding, scope) {
  if (key !== 'archive_content_incomplete' && key !== 'archive_summary_citation_missing') return finding;
  const ambiguous = scope.archive_name_ambiguous && archiveNameMatchesProject(finding.project, scope.project);
  return Object.assign({}, finding, { attribution: ambiguous ? 'ambiguous_name_match' : 'name_match' });
}

// The scoped verdict. Clean requires every scoped class to have EVALUATED and to be empty: a class
// that reported 'skipped_offline'/'skipped_timeout' cannot prove the project clean, so it does not —
// the same fail-closed rule isDirty follows for an unprobeable tree.
//
// A --project that resolved to no record is that rule applied to the SCOPE itself: nothing was read
// for the name, so no class speaks for the project the operator named, whatever the classes say about
// the issue numbers that came in beside it. The scope is optional so the drift-only rule stays
// callable on its own.
function driftIsClean(drift, scope) {
  if (scope && scope.project_unresolved) return false;
  for (const key of Object.keys(drift)) {
    const value = drift[key];
    if (!Array.isArray(value) || value.length > 0) return false;
  }
  return true;
}

// Consumes the report from buildAuditReport — does NOT re-run detection.
// Repairs only safe local roadmap sources + regenerate + remote label removal.
function executeRepairs(root, report) {
  // ADR 0018 §5: the stale-.roadmap-source removal + regenerateRoadmap repair stood here — there is
  // no local roadmap source or mirror left for --execute to repair.
  const labelsRemoved = [];
  const labelsFailed = [];
  let labelsSkippedReason = null;
  const labels = report.drift.stale_in_progress_labels;
  if (labels === 'skipped_timeout') {
    labelsSkippedReason = 'detection_timeout';
  } else if (Array.isArray(labels)) {
    for (const it of labels) {
      try { ghExec(['issue', 'edit', String(it.number), '--remove-label', CLAIM_LABEL]); labelsRemoved.push(it.number); }
      catch (err) {
        labelsFailed.push(it.number);
        if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
          labelsSkippedReason = 'timeout';
          break;
        }
      }
    }
  }

  const repairedObj = {
    labels_removed: labelsRemoved,
    labels_failed: labelsFailed
  };
  if (labelsSkippedReason) repairedObj.labels_skipped_reason = labelsSkippedReason;

  const reportedNotRepaired = {
    active_folder_for_closed_issue: report.drift.active_folder_for_closed_issue,
    unarchived_pr_folders: report.drift.unarchived_pr_folders,
    // #832: an incomplete archive is not repairable — the lost bytes are gone by construction
    // (computePlanHash over a reconstruction cannot reproduce the frozen marker). Report it and
    // never delete or rewrite it.
    archive_content_incomplete: report.drift.archive_content_incomplete
  };
  // #901: omitted when empty, mirroring the drift key it carries — an --execute envelope on a repo
  // with no citation drift stays exactly as it was. A cited-but-missing artifact is unrepairable for
  // the same reason an incomplete archive is.
  if (report.drift.archive_summary_citation_missing) {
    reportedNotRepaired.archive_summary_citation_missing = report.drift.archive_summary_citation_missing;
  }

  return { repaired: repairedObj, reported_not_repaired: reportedNotRepaired };
}

function main() {
  // Flags before the repo probe, so --help answers outside a git repository too.
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(USAGE); return; }
  const root = getRoot();
  const scope = resolveScope(root, args);
  const report = buildAuditReport(root);

  // Unscoped: byte-for-byte the envelope this script has always emitted.
  if (!scope) {
    if (args.execute) {
      const result = executeRepairs(root, report);
      process.stdout.write(JSON.stringify({
        dry_run: false,
        offline: report.offline,
        repaired: result.repaired,
        reported_not_repaired: result.reported_not_repaired
      }, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        dry_run: true,
        offline: report.offline,
        drift: report.drift,
        counts: report.counts
      }, null, 2) + '\n');
    }
    return;
  }

  const { inScope, outScope } = partitionDriftByScope(report.drift, scope);
  const scopeOut = { project: scope.project, issue_numbers: scope.issue_numbers, state_file: scope.state_file };
  // Both omitted unless true, so a resolvable unambiguous scope emits exactly the three keys it always
  // did. `project_unresolved` is what makes the null state_file above legible: the name resolved to
  // nothing, and the verdict below refuses to call that clean.
  if (scope.project_unresolved) scopeOut.project_unresolved = true;
  if (scope.archive_name_ambiguous) scopeOut.archive_name_ambiguous = true;

  if (args.execute) {
    // Repairs consume the SCOPED drift, so an unrelated issue's label is never touched.
    const result = executeRepairs(root, { drift: inScope });
    process.stdout.write(JSON.stringify({
      dry_run: false,
      offline: report.offline,
      scope: scopeOut,
      repaired: result.repaired,
      reported_not_repaired: result.reported_not_repaired,
      repository_drift_outside_scope: outScope,
      repository_counts_outside_scope: driftCounts(outScope)
    }, null, 2) + '\n');
    return;
  }

  process.stdout.write(JSON.stringify({
    dry_run: true,
    offline: report.offline,
    scope: scopeOut,
    current_project_clean: driftIsClean(inScope, scope),
    current_project_drift: inScope,
    current_project_counts: driftCounts(inScope),
    repository_drift_outside_scope: outScope,
    repository_counts_outside_scope: driftCounts(outScope)
  }, null, 2) + '\n');
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write((err && err.message ? err.message : String(err)) + '\n'); process.exitCode = 1; }
}

module.exports = {
  buildAuditReport,
  executeRepairs,
  collectClosedSet,
  // #832: archive CONTENT proof — exported for direct unit coverage of the record-derived rule.
  detectArchiveContentIncomplete,
  archiveRequiredContent,
  // #901: the summary-citation rule, same reason.
  detectArchiveSummaryCitationMissing,
  archiveCitedMissing,
  // #903: the scoping surface — the flag contract, the project→issues resolution and the partition
  // are each testable without spawning the CLI.
  parseArgs,
  archiveNameMatchesProject,
  stateIssueNumbers,
  resolveProjectIssues,
  partitionDriftByScope,
  driftCounts,
  driftIsClean
};
