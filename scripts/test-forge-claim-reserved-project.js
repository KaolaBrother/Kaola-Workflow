#!/usr/bin/env node
'use strict';

// test-forge-claim-reserved-project.js — a claim must not write run state into a directory that is
// not a project folder, per edition.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production script.
//
// > A claim must not write run state into a directory that is not a project folder.
//
// WHY PER EDITION. The four `claim.js` copies are HAND-PORTED, and the name resolution this pins
// lives in the diverging part of them. `validate-script-sync.js` compares only `scripts/<name>`
// against `plugins/kaola-workflow/scripts/<name>`, so the forge-renamed `kaola-<forge>-workflow-claim.js`
// is compared to nothing — it is in neither COMMON_SCRIPTS nor RENAME_NORMALIZED_FAMILIES. A
// gitlab-only or gitea-only miss is therefore invisible to that check, to `edition-sync --check`,
// and to every export-superset guard, and `simulate-workflow-walkthrough.js` pins this behaviour on
// canonical alone. So an incomplete four-copy fix ships silently unless a behavioural pin drives
// each edition's own CLI — the same argument, and the same shape, as the sibling
// `scripts/test-forge-claim-rollback-scoping.js`.
//
// AND THE GAP WAS MEASURED, not assumed: at `406b5639` all four editions were driven directly and
// all four reproduced, landing `workflow-state.md` (and, through `startup`,
// `.cache/origin/selection-record.json`) inside `kaola-workflow/.roadmap/` at exit 0 with claim
// `acquired`. The resolution site is one shape in all four — `args.project || projectNameForIssue(...)`
// followed by the `isSafeName` assert, byte-identical modulo the single identifier `issueNumber`
// (canonical, codex) vs `issueIid` (gitlab, gitea).
//
// THE DEFECT. `isSafeName` is PATH safety and nothing more — no separator, no NUL, not `.` or `..` —
// so `.roadmap` and `archive` both pass it, and `isReservedWorkflowDirName` has exactly one call
// site in every edition, inside `archiveProjectDir`, with no claim-path caller at all. The name
// reaches the claim from two doors: the `--project` flag, and `workflow_project:` in a roadmap
// source, which `projectNameForIssue` reads back out verbatim. Neither door was filtered.
//
// THE OWNER RULED IT RESOLVES rather than refuses: the claim SUCCEEDS in a legitimate folder and the
// envelope reports the swap. So exit 0 and an acquiring envelope are REQUIRED here — an answer that
// refuses at the claim site reds this on purpose — and that requirement is also every leg's LIVENESS
// witness: a fixture that stopped reaching the claim reds on it rather than passing vacuously
// through the survival assertions behind it.
//
// WHAT IS PINNED. The RESULT: the run lands in `issue-<N>`, durable state agrees with the envelope,
// the reserved directory gains nothing and loses nothing. Plus TWO envelope keys by name, which is a
// deliberate exception to pinning results only — the substitution has to be visible to whatever
// reads a claim envelope, and "some field somewhere mentions the string" is not falsifiable when the
// fixture's own roadmap path contains `.roadmap`:
//
//   * `reserved_project` — the declined name, DISCRETE, exactly as the caller supplied it;
//   * `reserved_project_note` — the prose beside it.
//
// The pairing is this tree's own: #403.8 put `worktree_error_class` next to `worktree_error` so a
// caller "has a machine-readable signal instead of having to parse a raw git error string". Neither
// key takes forge vocabulary — the same two names in all four editions, which is itself part of what
// this file checks.
//
// FOREIGN vs the run's own: only content that predates the claim AND does not belong to this run is
// pinned byte-for-byte. On the roadmap-data legs the run's own source lives inside `.roadmap` and is
// pinned as still-PRESENT only, so a fix that records the resolved name back into it stays legal.
//
// `Archive` runs only where the filesystem actually aliases it to `archive` (APFS and NTFS by
// default), probed rather than assumed. It is here rather than left to the walkthrough because the
// fold is a per-edition line in a hand-port: a gitlab copy that dropped the `toLowerCase` would put
// run state inside the archive band while canonical stayed green.
//
// NO NO-ISSUE-NUMBER LEG, and the absence is measured rather than an oversight. `claimProject` is
// exported and has direct callers that pass no issue field, so a reserved name arriving that way
// looks like a hole — it is not one. `writeState` infers the issue number ONLY from a project name
// matching `/^issue-([1-9][0-9]*)$/`, so any other substitute reaches `buildClaimIdentity` ->
// `normalizeIssueNumbers` (kaola-workflow-adaptive-schema.js, byte-identical across the editions)
// with nothing usable and throws `claim_issue_numbers_invalid` INSIDE the transaction. Driven both
// ways over a seeded `.roadmap`: same throw, same token, same file set and same directory set, with
// the substitution in place and with it removed. There is no input on which that path completes, so
// there is no result to pin — and a pin there would outlive its mechanism as a trap.
//
// Usage
//   node scripts/test-forge-claim-reserved-project.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

// This box has no global `init.defaultBranch`, and the fixtures must not inherit whatever a
// developer's global config says about excludes, autocrlf or safe.directory either. Neutralised for
// the fixture git calls AND for the spawned CLI, which inherits this environment.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_SYSTEM = '/dev/null';

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

const EDITIONS = Object.freeze([
  { key: 'canonical', label: 'claude/canonical', claim: 'scripts/kaola-workflow-claim.js' },
  { key: 'codex', label: 'codex', claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js' },
  { key: 'gitlab', label: 'gitlab', claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js' },
  { key: 'gitea', label: 'gitea', claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js' },
]);

// The two envelope keys the substitution is reported on. Named once, so a rename is one edit here
// and the four editions are still required to agree with each other.
const NAME_KEY = 'reserved_project';
const NOTE_KEY = 'reserved_project_note';

// Is this filesystem case-insensitive? Probed, because it decides whether `Archive` and `archive`
// name the same directory and therefore whether the aliasing leg has a subject at all.
const CASE_INSENSITIVE_FS = (() => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw933-caseprobe-')));
  try {
    fs.writeFileSync(path.join(d, 'CaseProbe'), '');
    return fs.existsSync(path.join(d, 'caseprobe'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** A one-commit repo. `outer` is always the throwaway to remove afterwards. */
function newRepo(ed, tag) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw933-' + tag + '-' + ed.key + '-')));
  G.init(root, { branch: 'main' });
  fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.kw/\n');
  G.commitAll(root, 'init');
  return { root, outer: root };
}

/**
 * The roadmap source the claim resolves its project name from. `workflowProject` is the whole of
 * the roadmap-data door: written into the file rather than passed on argv, which is what makes that
 * door reachable with no operator flag anywhere.
 */
function seedRoadmapSource(root, issue, workflowProject) {
  const dir = path.join(root, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issue + '.md'), [
    'issue: #' + issue,
    'title: the claimed issue',
    'status: open',
    'workflow_project: ' + (workflowProject || '—'),
    'next_step: ready',
    ''
  ].join('\n'));
}

/** Content that PREDATES the claim, inside the reserved directory. */
function seedReserved(root, reserved, files) {
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, 'kaola-workflow', reserved, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
}

/** Everything under a directory, as a sorted list of relative paths. */
function listTree(dir) {
  const out = [];
  (function walk(d, rel) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r);
    }
  })(dir, '');
  return out.sort();
}

/** The edition's own CLI, driven for real. */
function runClaim(ed, root, argv) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [path.join(repoRoot, ed.claim), ...argv],
    { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
}

/** The claim envelope: the LAST JSON object on stdout. A throwing door emits none. */
function parseEnvelope(stdout) {
  const lines = String(stdout || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch (_) { /* keep looking */ }
  }
  return null;
}

const ctx = r => '\nexit: ' + r.status + '\nstdout: ' + String(r.stdout).trim()
  + '\nstderr: ' + String(r.stderr).trim();

// The roadmap SOURCES. Losing or burying these leaves the repository with no backlog at all.
const ROADMAP_FOREIGN = Object.freeze({
  '.gitkeep': '',
  '_rules.md': '# Project rules\n\nEvery run reads this file.\n',
  'issue-9459.md': 'issue: #9459\ntitle: unrelated backlog item\nstatus: open\nworkflow_project: —\nnext_step: ready\n',
});
// The archive band: a completed run's record the claim would otherwise be writing alongside.
const ARCHIVE_FOREIGN = Object.freeze({
  'issue-9400/workflow-state.md': '# Kaola-Workflow State\n\n## Project\nname: issue-9400\nstatus: closed\n',
  'issue-9400/mission-list.md': '# a prior run record\n',
});

// ---------------------------------------------------------------------------
// The per-leg predicate. One shape for every door, every reserved name and every edition.
//
// `given` is the name the CALLER supplied; `reserved` is the directory on disk it resolves to.
// They differ only on the aliasing leg, where that difference is the point.
// ---------------------------------------------------------------------------
function assertResolvedAround(tag, root, leg, r, before) {
  const env = parseEnvelope(r.stdout);
  const resolved = 'issue-' + leg.issue;
  const reservedDir = path.join(root, 'kaola-workflow', leg.reserved);

  // (1) THE CLAIM STILL SUCCEEDS. The ruling is resolve and report, not refuse — and this is also
  // the leg's liveness witness, so nothing below can go quietly vacuous behind a fixture that
  // stopped reaching the claim.
  assert(r.status === 0,
    tag + ' the claim must still succeed at exit 0 — the ruling is resolve and report, not refuse'
      + ctx(r));
  assert(env !== null && env.status === 'acquired' && env.verdict === 'green' && env.claim === 'acquired',
    tag + ' the claim must still report an acquiring envelope — got '
      + JSON.stringify(env && { status: env.status, verdict: env.verdict, claim: env.claim }) + ctx(r));

  // (2) IT ACQUIRED A LEGITIMATE FOLDER AND SAYS SO. Stated positively, so a red names the value
  // that was wrong rather than merely reporting an absence.
  assert(env !== null && env.project === resolved,
    tag + ' the claim must resolve to kaola-workflow/' + resolved + ', not the reserved name — got '
      + 'project=' + JSON.stringify(env && env.project) + ctx(r));
  if (env && Object.prototype.hasOwnProperty.call(env, 'selected_project')) {
    assert(env.selected_project === resolved,
      tag + ' selected_project must agree with project (' + resolved + ') — got '
        + JSON.stringify(env.selected_project) + ctx(r));
  }

  // (3) DURABLE STATE AGREES WITH THE ENVELOPE. `name:` is what every later resume reads, so an
  // envelope saying issue-<N> over a state file still naming the reserved directory has moved the
  // report and not the run.
  const resolvedState = path.join(root, 'kaola-workflow', resolved, 'workflow-state.md');
  assert(fs.existsSync(resolvedState),
    tag + ' the run state must land in kaola-workflow/' + resolved + '/workflow-state.md' + ctx(r));
  const stateName = ((fs.existsSync(resolvedState) ? fs.readFileSync(resolvedState, 'utf8') : '')
    .match(/^name:\s*(\S+)\s*$/m) || [])[1];
  assert(stateName === resolved,
    tag + ' workflow-state.md must record name: ' + resolved + ' — got ' + JSON.stringify(stateName)
      + ctx(r));

  // (4) THE SWAP IS REPORTED. The discrete field carries the name the caller supplied EXACTLY,
  // casing and all, rather than something a reader has to extract from prose. On the aliasing leg
  // that means `Archive`: which directory it collided with is what (2) and (5) establish, and what
  // only the caller knows is what the caller ASKED for.
  assert(env !== null && env[NAME_KEY] === leg.given,
    tag + ' the envelope must carry `' + NAME_KEY + '`: ' + JSON.stringify(leg.given) + ' — the '
      + 'declined directory, verbatim as supplied, as a discrete field rather than only inside '
      + 'prose. Got ' + JSON.stringify(env && env[NAME_KEY]) + ctx(r));
  const note = env && env[NOTE_KEY];
  assert(typeof note === 'string' && note.trim() !== '',
    tag + ' the envelope must carry a non-empty `' + NOTE_KEY + '` reporting that ' + leg.given
      + ' was declined and ' + resolved + ' used instead — got ' + JSON.stringify(note) + ctx(r));
  assert(typeof note === 'string' && note.toLowerCase().includes(leg.given.toLowerCase()),
    tag + ' `' + NOTE_KEY + '` must name the declined directory ' + leg.given + ' — got '
      + JSON.stringify(note) + ctx(r));

  // (5) THE RESERVED DIRECTORY IS UNTOUCHED. The two artifacts this defect was MEASURED writing are
  // named first, so a red says which write landed; the SET below is what catches the next one.
  assert(fs.existsSync(reservedDir),
    tag + ' kaola-workflow/' + leg.reserved + ' must still exist' + ctx(r));
  assert(!fs.existsSync(path.join(reservedDir, 'workflow-state.md')),
    tag + ' the claim wrote run state to kaola-workflow/' + leg.reserved + '/workflow-state.md — '
      + 'that directory is not a project folder' + ctx(r));
  assert(!fs.existsSync(path.join(reservedDir, '.cache')),
    tag + ' the claim wrote kaola-workflow/' + leg.reserved + '/.cache/ — that directory is not a '
      + 'project folder' + ctx(r));
  for (const [rel, body] of Object.entries(leg.foreign)) {
    const f = path.join(reservedDir, rel);
    assert(fs.existsSync(f),
      tag + ' the claim removed kaola-workflow/' + leg.reserved + '/' + rel + ctx(r));
    assert(fs.existsSync(f) && fs.readFileSync(f, 'utf8') === body,
      tag + ' the claim altered kaola-workflow/' + leg.reserved + '/' + rel + ctx(r));
  }

  // (5b) THE DIRECTORY AS A SET. Presence-and-bytes cannot see a file ADDED, and the two named
  // artifacts above are only the writes this defect was observed making.
  const added = listTree(reservedDir).filter(p => !before.includes(p));
  assert(added.length === 0,
    tag + ' the claim added entries inside kaola-workflow/' + leg.reserved + '/: '
      + JSON.stringify(added) + ' — a claim writes into its project folder, and this is not one'
      + ctx(r));
}

// ---------------------------------------------------------------------------
// The legs. TWO DOORS x TWO RESERVED SHAPES, plus the aliasing arm.
//
// The doors are not variants of one another. On the flag legs an operator types the name. On the
// roadmap-data legs NOBODY types anything: the name travels in `workflow_project:` and
// `projectNameForIssue` reads it back out verbatim. A guard on the roadmap-AUTHORING side answers
// the second and not the first.
// ---------------------------------------------------------------------------
const LEGS = Object.freeze([
  { key: 'A', door: 'flag', reserved: '.roadmap', given: '.roadmap', issue: 9450, foreign: ROADMAP_FOREIGN },
  { key: 'B', door: 'roadmap-data', reserved: '.roadmap', given: '.roadmap', issue: 9451, foreign: ROADMAP_FOREIGN },
  { key: 'C', door: 'flag', reserved: 'archive', given: 'archive', issue: 9452, foreign: ARCHIVE_FOREIGN },
  { key: 'D', door: 'roadmap-data', reserved: 'archive', given: 'archive', issue: 9453, foreign: ARCHIVE_FOREIGN },
  { key: 'E', door: 'flag', reserved: 'archive', given: 'Archive', issue: 9454, foreign: ARCHIVE_FOREIGN,
    skip: !CASE_INSENSITIVE_FS },
]);

let ranLegs = 0;
for (const ed of EDITIONS) {
  for (const leg of LEGS) {
    if (leg.skip) {
      console.log('  #933[' + ed.label + '/' + leg.key + '] skipped ' + JSON.stringify(leg.given)
        + ': this filesystem is case-sensitive, so it does not alias the reserved directory');
      continue;
    }
    ranLegs++;
    const tag = '#933[' + ed.label + '/' + leg.key + ' ' + leg.door + ' ' + leg.given + ']';
    const { root, outer } = newRepo(ed, leg.key);
    try {
      seedReserved(root, leg.reserved, leg.foreign);
      // The run's OWN roadmap source. On the roadmap-data legs this single line IS the entry point;
      // on the flag legs it carries the em-dash placeholder and the name comes from argv.
      seedRoadmapSource(root, leg.issue, leg.door === 'roadmap-data' ? leg.given : null);
      G.commitAll(root, 'seed the reserved directory');

      const before = listTree(path.join(root, 'kaola-workflow', leg.reserved));
      const argv = leg.door === 'roadmap-data'
        ? ['startup', '--target-issue', String(leg.issue)]
        : ['claim', '--project', leg.given, '--issue', String(leg.issue)];
      const r = runClaim(ed, root, argv);

      assertResolvedAround(tag, root, leg, r, before);

      // The run's own roadmap source survives. Pinned as PRESENT only — see the header.
      assert(fs.existsSync(path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + leg.issue + '.md')),
        tag + ' the claim removed the run\'s own roadmap source kaola-workflow/.roadmap/issue-'
          + leg.issue + '.md' + ctx(r));
    } finally { fs.rmSync(outer, { recursive: true, force: true }); }
  }

  console.log('#933[' + ed.label + '] claim reserved-project resolution: done');
}

// The leg count is printed, not asserted: on a case-sensitive filesystem the aliasing arm has no
// subject and is skipped above with a reason. A silent skip is what this line prevents.
console.log('\n' + ranLegs + '/' + (EDITIONS.length * LEGS.length) + ' legs ran ('
  + EDITIONS.length + ' editions x ' + LEGS.length + ' legs)');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
