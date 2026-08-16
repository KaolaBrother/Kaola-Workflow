#!/usr/bin/env node
'use strict';

// test-forge-finalize-findings.js — the finalize finding-type registry, per edition.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// The four `claim.js` copies are HAND-PORTED. `validate-script-sync.js` compares only
// `scripts/<name>` against `plugins/kaola-workflow/scripts/<name>`, so the forge-renamed
// `kaola-<forge>-workflow-claim.js` is compared to nothing, and `edition-sync.js` states the
// data-layer ports are covered behaviourally rather than by parity. Nothing else reads the
// finding types at all. This file is the two pins that absence leaves owing.
//
// A — BEHAVIOURAL. The forge ports do not carry `archive_unstage_failed`, and the recorded
//     reason is that their own `archive_stage_failed` message ALREADY names the consequence the
//     sixth type announces: the live run folder staying on the branch. That reason is a claim
//     about a message string in a file no test reads. Part A drives a REAL finalize on each
//     edition with the archive-staging git call forced to fail, and reads what the run actually
//     said — the envelope's finding types and the durable `finalization-summary.md` section.
//     Each edition is also run once WITHOUT the fault, so "the finding fired" is distinguishable
//     from "the finding always fires".
//
// B — STATIC, and deliberately not dressed up as behavioural. A drift guard over the finding-type
//     registries and the two places `docs/api.md` states them. It answers a different question
//     from A — "did a type appear or vanish that the docs do not know about?" — which no single
//     run can witness, because a run only ever exercises the types its own fault reaches. The
//     enumeration is the honest mechanism for it. Its tail checks the two `*_unstaged` rows for
//     SCOPE rather than content, against emission measured by A: one of them is edition-specific
//     and one is universal, and a row that does not say which is read as universal by default.
//
// C — BEHAVIOURAL, and specifically the run that FALSIFIES what these findings say about git. A
//     staging message asserted `git add` is all-or-nothing over its pathspec list and that
//     therefore nothing was staged. A holds the index lock, where nothing is staged and the
//     sentence is only unmeasured; C gitignores one of the archive step's own two candidate paths
//     and reads the resulting index back out of git, where the other candidate IS staged and
//     committed while the run reports it as unstaged.
//
// D — BEHAVIOURAL. Finalize stages its residue with one `git add -A` over every uncommitted
//     non-`kaola-workflow/` path, so an artifact that was in the tree for reasons unrelated to
//     the run is committed under `chore: finalize` — measured, mode 120000 for a symlink, and the
//     tree it leaves behind is clean, which is why nothing noticed. D drives a real finalize with
//     three shapes of foreign artifact planted beside the run's own dirt and reads the commit git
//     wrote. It pins BOTH directions: the foreign paths are named in a typed finding and stay out
//     of the repository, AND the run's own dirt is still swept in.
//
// Non-vacuity is mechanical, never a claim in a comment:
//   * every set-equality in B is preceded by a shape guard, so an extractor that silently
//     matched nothing cannot pass as `[] === []`;
//   * the docs row and the docs count sentence must be FOUND, not merely agree once found;
//   * A's healthy control asserts the very finding the fault leg asserts is ABSENT, so a fixture
//     that failed for its own reasons cannot green the fault leg;
//   * D reads its fixture out of git BEFORE the run — all five planted paths dirty, and nothing
//     the branch committed reaching into the directory the foreign ones sit in — so neither a
//     shape that failed to plant nor a "foreign" path that is really attributable can pass
//     unnoticed; and it runs the same fixture once with no foreign artifact at all.
//
// Usage
//   node scripts/test-forge-finalize-findings.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// ---------------------------------------------------------------------------------------------
// The editions, and what each one is expected to say.
//
// `unstageType` is the whole divergence: canonical and Codex un-stage the live folder with their
// own `git rm -r --cached` and can therefore fail at it; the forge ports make one `git add -A
// 'kaola-workflow/'` and cannot. `liveFolderClause` is the SPAN of the message that carries the
// consequence — bound at clause granularity so a reword that keeps the meaning stays green and a
// reword that drops it reds, which a whole-string compare and a bare "folder" search both fail to
// do in opposite directions.
// ---------------------------------------------------------------------------------------------
const FORGE_LIVE_FOLDER_CLAUSE = 'the removal of the live run folder from the branch';
const CANONICAL_LIVE_FOLDER_CLAUSE = 'may still carry the live run folder';

// ---------------------------------------------------------------------------------------------
// The claim a staging finding is not allowed to make.
//
// MEASURED on git 2.54.0, not read off a man page. `git add -A -- <gitignored> <addable>` exits 1
// and STAGES the addable one; only an UNMATCHED pathspec exits 128 and stages nothing. So the
// all-or-nothing property is one `git add` does not have, and the finalize archive step reaches
// the ignored case for real — `kaola-workflow/` paths can be covered by a .gitignore rule.
//
// Bound to the CLAIM rather than to the sentence carrying it: what the message says about the
// step is the implementer's to word, but this assertion about git is not theirs to make. Bound to
// RENDERED output rather than to source text, which is the only reading that can tell the false
// message apart from the accurate code comment beside it — that comment describes the unmatched-
// path case, where the property does hold, and it is not the defect.
// ---------------------------------------------------------------------------------------------
const ALL_OR_NOTHING_CLAIM = 'all-or-nothing over its pathspec list';

// #988: NONE_STAGED_CLAIMS stood here — three regexes for "and therefore nothing was staged",
// asserted ONLY in part C because that was the one run that demonstrated the sentence false. With
// `kaola-workflow/ROADMAP.md` out of the archive candidate list, part C's run stages nothing, so the
// sentence is true there and the scans had nothing left to catch. Deleted with the state they
// described; part A's index lock never measured them either, and pinning them there would have been
// pinning wording rather than behaviour.

// ---------------------------------------------------------------------------------------------
// Part D's contract (issue #975): the finding type and the transaction field that carry a
// finalize-time path the run cannot attribute to itself.
//
// These two NAMES are the contract, not an implementation detail: `finalize_transaction.findings`
// and its sibling fields are what a consumer routes on, and a rename is an envelope change for
// every one of them. Re-pointing these constants at whatever name shipped would retire the pin
// rather than read it — if the name is to change, change it here deliberately and say so.
//
// The behaviour they name was MEASURED at 69264936, end to end, with the exact 2026-08-12
// artifact planted. `chore: finalize issue-914` carried, at exit 0 and with
// `findings: ["claim_release_skipped_offline"]` and nothing else:
//     A plugins/plugins            120000 f4f388c8   <- the artifact, staged as a symlink
//     A plugins/stray.txt          100644
//     M plugins/kaola-workflow/plugin.json
//     A src/helper.js  /  M src/impl.js               <- the run's own work, correctly carried
// The current fault is not that the paths go unnoticed — the residue probe sees each one by name
// and hands it to `git add -A`. It is that they are ADOPTED.
// ---------------------------------------------------------------------------------------------
const UNATTRIBUTED_TYPE = 'residue_unattributed';
const UNATTRIBUTED_FIELD = 'residue_unattributed';

// THREE shapes of foreign artifact, planted in ONE run so a classifier that reads a path's TYPE
// rather than its provenance cannot pass by catching only the shape that happened to be observed.
// Each one closes a different near-miss:
//   * the symlink is the 2026-08-12 artifact itself;
//   * the plain file forbids "a symlink is the foreign thing";
//   * the MODIFICATION to an already-tracked file forbids "only an untracked path can be foreign",
//     which is the cheapest wrong rule available here and the one that would look right against
//     the single observed instance. Measured adopted exactly like the other two: the tampered
//     content is what `chore: finalize` committed.
// `plugins/` holds a tracked file and the branch never touches it, so git lists the untracked
// paths individually rather than collapsing the directory — the form the residue probe reads.
const FOREIGN_SYMLINK = 'plugins/plugins';
const FOREIGN_FILE = 'plugins/stray.txt';
const FOREIGN_TRACKED = 'plugins/kaola-workflow/plugin.json';
const FOREIGN_TRACKED_ORIGINAL = '{}\n';
const FOREIGN_TRACKED_TAMPERED = '{"not":"this run\'s"}\n';
// The two untracked ones only. The tracked modification is asserted separately: `ls-files` says
// nothing about it (it has been tracked since `main`), so "did it enter the repository" is read
// there as "did the tampered CONTENT reach the commit".
const FOREIGN_UNTRACKED = Object.freeze([FOREIGN_SYMLINK, FOREIGN_FILE]);
const FOREIGN_ALL = Object.freeze([FOREIGN_SYMLINK, FOREIGN_FILE, FOREIGN_TRACKED]);
// The run's OWN implementation dirt, in both shapes finalize legitimately sweeps into
// `chore: finalize`: a modification to a file the branch's implementation commit already carries,
// and a new file in the directory that commit touched. These are the anti-over-reach pins — a fix
// that reports foreign dirt by declining to stage anything it did not itself author would pass
// every assertion about the artifact and silently stop finishing ordinary runs.
const OWN_TRACKED = 'src/impl.js';
const OWN_UNTRACKED = 'src/helper.js';

// Part C's two archive candidate paths: the first is covered by the fixture's .gitignore, the
// second is not. Both are real entries of the archive step's own pathspec list.
// #988: ADDABLE_ARCHIVE_PATH ('kaola-workflow/ROADMAP.md') stood beside this one and was the other
// half of the pair — the candidate the fixture left un-ignored so a failing `git add` still had
// something to stage. It left the archive step's candidate list with the retired mirror, so there is
// no second candidate to name here any more.
const IGNORED_ARCHIVE_PATH = 'kaola-workflow/.roadmap';

const EDITIONS = Object.freeze([
  {
    key: 'canonical',
    label: 'claude/canonical',
    claim: 'scripts/kaola-workflow-claim.js',
    schema: 'scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: [],
    unstageType: true,
  },
  {
    key: 'codex',
    label: 'codex',
    claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    schema: 'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: [],
    unstageType: true,
  },
  {
    key: 'gitlab',
    label: 'gitlab',
    claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    schema: 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: ['## GitLab', 'issue_iid: 1', 'project_id: 77', 'path_with_namespace: g/p', ''],
    unstageType: false,
  },
  {
    key: 'gitea',
    label: 'gitea',
    claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
    schema: 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: ['## Gitea', 'issue_iid: 1', 'full_name: g/p',
      'project_html_url: https://gitea.example/g/p', ''],
    unstageType: false,
  },
]);

const PROJECT = 'issue-914';

// =============================================================================================
// A — BEHAVIOURAL: what a REAL finalize says when the archive staging genuinely fails
// =============================================================================================

/**
 * A finalize fixture: a repo on `main` holding the live run folder, plus a linked worktree on the
 * feature branch holding its own copy. This is the shape `finalize --keep-worktree` is invoked in,
 * and it is the shape both staging designs were written against.
 */
function buildFixture(ed, opts) {
  const o = opts || {};
  const mainRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw914-' + ed.key + '-')));
  const kwRoot = mainRoot + '.kw';
  const wtPath = path.join(kwRoot, PROJECT);
  const schema = require(path.join(repoRoot, ed.schema));

  const seed = root => {
    const dir = path.join(root, 'kaola-workflow', PROJECT, '.cache');
    fs.mkdirSync(dir, { recursive: true });
    let hash = '';
    try { hash = schema.computeCodeTreeHash(root, PROJECT, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { hash = ''; }
    fs.writeFileSync(path.join(dir, 'final-validation.md'),
      'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + hash + '\n');
  };
  const writeState = root => {
    const dir = path.join(root, 'kaola-workflow', PROJECT);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + PROJECT, 'status: active', '',
    ].concat(ed.stateForgeSection, [
      '## Sink', 'branch: workflow/' + PROJECT, 'issue_number: 1', 'sink: merge',
      'worktree_path: ' + wtPath, '',
    ]).join('\n'));
  };

  G.init(mainRoot, { branch: 'main' });
  fs.writeFileSync(path.join(mainRoot, 'README.md'), 'init\n');
  // Part C: one of the two archive candidate paths is gitignored and the other is not. The rule
  // is COMMITTED, so it is in force on the feature branch the archive step actually stages on.
  if (o.ignoredArchivePath) {
    fs.writeFileSync(path.join(mainRoot, '.gitignore'), IGNORED_ARCHIVE_PATH + '/\n');
  }
  // Part D: an implementation directory the run will change, and a SECOND tracked directory it
  // never touches. `plugins/` has to hold a tracked file for the foreign paths to be listed
  // individually — git collapses a wholly-untracked directory to `?? plugins/`, and the residue
  // probe would then read one entry rather than the two the fault is about.
  if (o.implementation) {
    fs.mkdirSync(path.join(mainRoot, path.dirname(OWN_TRACKED)), { recursive: true });
    fs.writeFileSync(path.join(mainRoot, OWN_TRACKED), 'module.exports = 1;\n');
    fs.mkdirSync(path.join(mainRoot, path.dirname(FOREIGN_TRACKED)), { recursive: true });
    fs.writeFileSync(path.join(mainRoot, FOREIGN_TRACKED), FOREIGN_TRACKED_ORIGINAL);
  }
  G.commitAll(mainRoot, 'init');
  fs.mkdirSync(kwRoot, { recursive: true });
  G.exec(mainRoot, ['worktree', 'add', '-b', 'workflow/' + PROJECT, '--', wtPath, 'main'],
    { encoding: 'utf8', stdio: 'pipe' });

  // Part D: the run's OWN implementation commit. Without it `probeImplementationCommit` reads
  // implementation-shaped dirt beside a branch carrying none, and finalize refuses at
  // `implementation_commit_missing` before it ever reaches the residue staging under test.
  if (o.implementation) {
    fs.writeFileSync(path.join(wtPath, OWN_TRACKED), 'module.exports = 2;\n');
    G.commitPaths(wtPath, [path.dirname(OWN_TRACKED) + '/'], 'feat: the implementation');
  }

  // The live folder is COMMITTED on the feature branch: staging it away is exactly the work the
  // archive step does, so a fixture that left it untracked would make the failure unobservable.
  writeState(wtPath);
  seed(wtPath);
  G.commitPaths(wtPath, ['kaola-workflow/'], 'chore: finalize ' + PROJECT);

  writeState(mainRoot);
  seed(mainRoot);
  G.commitPaths(mainRoot, ['kaola-workflow/'], 'mirror: live folder on main');

  // Part C: the gitignored candidate must EXIST for the archive step to pathspec it and for the
  // `git add` to fail on it. #988: this used to plant ADDABLE_ARCHIVE_PATH beside it so the failing
  // add had a path it could still stage — the partial-stage witness. `kaola-workflow/ROADMAP.md` is
  // no longer in the candidate list, so planting it here would write a file nothing reads and
  // nothing stages, which is the same dead-weight-reading-as-a-live-claim that #988 was filed about.
  if (o.ignoredArchivePath) {
    fs.mkdirSync(path.join(wtPath, IGNORED_ARCHIVE_PATH), { recursive: true });
    fs.writeFileSync(path.join(wtPath, IGNORED_ARCHIVE_PATH, 'issue-1.md'), '# 1\n');
  }
  // ADR 0018 §5: `existingPaths` in cmdFinalize's linked-run archive-stage block is
  // `['kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md']` filtered by fs.existsSync — plus,
  // in principle, `result.dest`, but `dest` lives under MAIN's project root and a linked worktree's
  // `root` can never be its ancestor, so `path.relative(root, dest)` always starts with `..` and is
  // excluded (claim.js:4825-4837, #832's own comment). Retiring `reconcileRoadmapForClosure` (the
  // production code that used to leave these two paths behind on a HEALTHY linked run) means
  // `existingPaths` is now permanently empty for any run that does not carry them for some OTHER
  // reason — so `archive_stage_failed` (the finding raised by the `git add` over `existingPaths`,
  // claim.js:4839-4870) cannot fire either, on ANY linked fixture that does not plant them itself.
  // `archiveStageCandidates` is that other reason, for the fault-injection leg specifically: it
  // plants the candidate Part C also plants (same constant, same untracked shape so `git add` has
  // real work), WITHOUT the .gitignore rule, so a healthy run WOULD stage it cleanly — it is
  // `lockIndex` (held by the caller) that makes staging fail, not the fixture. This is deliberately
  // NOT used by the healthy-control leg above: planting these paths there would recreate the exact
  // accident retirement exposed (a fixture manufacturing "something to stage" that no real linked
  // run produces any more) — see the healthy-control comment.
  //
  // #988: `kaola-workflow/ROADMAP.md` was planted here too, and is not any more. It left the
  // candidate list with the mirror it named, so writing it would have given this fixture a file
  // that no production code reads and no `git add` stages.
  if (o.archiveStageCandidates) {
    fs.mkdirSync(path.join(wtPath, IGNORED_ARCHIVE_PATH), { recursive: true });
    fs.writeFileSync(path.join(wtPath, IGNORED_ARCHIVE_PATH, 'issue-1.md'), '# 1\n');
  }

  // Part D: the dirt the run leaves in the worktree at finalize time. Written LAST so the
  // validation hash `seed()` recorded is the one the transaction re-computes — the run under test
  // is an ordinary one whose implementation moved on, not a fixture with a doctored record.
  if (o.ownDirt) {
    fs.writeFileSync(path.join(wtPath, OWN_TRACKED), 'module.exports = 3;\n');
    fs.writeFileSync(path.join(wtPath, OWN_UNTRACKED), 'module.exports = 9;\n');
  }
  if (o.foreignDirt) {
    // The 2026-08-12 artifact, in the shape both surviving records agree on the FORM of: a link
    // created inside a directory that already existed. `fs.symlinkSync` is given the full child
    // path, which is the one call shape that does not throw EEXIST against the parent.
    fs.symlinkSync('plugins', path.join(wtPath, FOREIGN_SYMLINK));
    fs.writeFileSync(path.join(wtPath, FOREIGN_FILE), 'not this run\'s\n');
    fs.writeFileSync(path.join(wtPath, FOREIGN_TRACKED), FOREIGN_TRACKED_TAMPERED);
  }

  return { mainRoot, kwRoot, wtPath };
}

function destroyFixture(fx) {
  try { G.exec(fx.mainRoot, ['worktree', 'remove', '--force', fx.wtPath], { encoding: 'utf8' }); } catch (_) { /* best effort */ }
  fs.rmSync(fx.mainRoot, { recursive: true, force: true });
  fs.rmSync(fx.kwRoot, { recursive: true, force: true });
}

/** The linked worktree's own git directory — where ITS index, and ITS index.lock, live. */
function worktreeGitDir(wtPath) {
  return fs.readFileSync(path.join(wtPath, '.git'), 'utf8').trim().replace(/^gitdir:\s*/, '');
}

/** The finalize envelope: the LAST JSON object on stdout, past whatever git printed before it. */
function parseEnvelope(stdout) {
  const lines = String(stdout || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch (_) { /* keep looking */ }
  }
  return null;
}

/** The body of one `### <type>` section of the durable `## Finalize Findings` write. */
function findingSection(summaryPath, type) {
  if (!fs.existsSync(summaryPath)) return null;
  const text = fs.readFileSync(summaryPath, 'utf8');
  const start = text.indexOf('\n### ' + type + '\n');
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.indexOf('\n### ');
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * Run the real edition CLI. `lockIndex` plants a stale `index.lock` in the worktree's git dir,
 * which makes every index WRITE fail while every read still works — the plainest instance of the
 * class `archive_stage_failed` exists for, and one that needs no permission games to reproduce.
 */
function runFinalize(ed, fx, lockIndex) {
  if (lockIndex) fs.writeFileSync(path.join(worktreeGitDir(fx.wtPath), 'index.lock'), '');
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath,
    [path.join(repoRoot, ed.claim), 'finalize', '--project', PROJECT, '--keep-worktree'],
    { cwd: fx.wtPath, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
  const env = parseEnvelope(r.stdout);
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    tx: (env && env.finalize_transaction) || null,
    findings: (env && env.finalize_transaction && env.finalize_transaction.findings) || [],
    summary: path.join(fx.mainRoot, 'kaola-workflow', 'archive', PROJECT, 'finalization-summary.md'),
  };
}

// Which `*_unstaged` fields each edition ACTUALLY sets, measured in the fault leg below and read
// by the docs-scope checks at the end of part B. A field is only ever set on a run whose staging
// FAILED, so nothing but a real fault run can measure this.
const unstagedEmitters = new Map();

for (const ed of EDITIONS) {
  // ---- healthy control: the finding is CAUSED by the fault, not carried by the fixture -------
  // ADR 0018 §5: this used to assert archive_stage==='staged' UNCONDITIONALLY — true for every
  // edition when `reconcileRoadmapForClosure` was still live, because a HEALTHY linked run always
  // left `kaola-workflow/.roadmap` and/or `ROADMAP.md` behind for the archive step to pick up. That
  // production mechanism is retired, and the four editions diverge in what survives it, which is
  // itself worth pinning rather than glossing over:
  //   - root/codex (ed.unstageType): `archive_stage='staged'` is set ONLY inside `if
  //     (existingPaths.length > 0)` (claim.js:4839-4843) — a SEPARATE step from the unconditional
  //     `git rm --cached` that un-stages the live folder. With existingPaths now permanently empty
  //     on a healthy linked run, that inner block never runs, and archive_stage stays 'skipped'
  //     (its documented default, api.md:380).
  //   - gitlab/gitea: `archive_stage='staged'` is set UNCONDITIONALLY once the combined `git rm
  //     --cached <live folder> [+ git add existingArchivePaths]` try succeeds (kaola-gitlab-
  //     workflow-claim.js:4550-4557) — existingArchivePaths being empty just means the `git add`
  //     is skipped, not that 'staged' is withheld. Their semantics never depended on the roadmap
  //     candidates existing, so retirement changes nothing for them: a healthy run still stages
  //     (unstages the live folder from the index) and still reads 'staged'.
  // Asserting a blanket 'staged' was a fixture accident for root/codex (team-lead ruling,
  // m984-fixture-rebuild) but an ACCURATE, unaffected observation for gitlab/gitea — collapsing
  // both into one assertion would either miss the retirement (root/codex) or invent a regression
  // that was never there (gitlab/gitea), so the two are asserted on ed.unstageType, the same axis
  // that already separates their staging mechanisms throughout this file.
  let fx = buildFixture(ed);
  try {
    const ok = runFinalize(ed, fx, false);
    assert(ok.status === 0,
      'behavioural[' + ed.label + '] healthy finalize must exit 0, got ' + ok.status
        + '\nstdout: ' + ok.stdout + '\nstderr: ' + ok.stderr);
    const expectedStage = ed.unstageType ? 'skipped' : 'staged';
    assert(ok.tx && ok.tx.archive_stage === expectedStage,
      'behavioural[' + ed.label + '] a healthy LINKED finalize must record archive_stage='
        + expectedStage + ' (' + (ed.unstageType
          ? 'nothing left in the worktree to stage — no local roadmap source survives retirement'
          : 'the unconditional live-folder unstage still succeeds regardless of roadmap-candidate '
            + 'existence') + '), got: ' + JSON.stringify(ok.tx));
    assert(!ok.findings.includes('archive_stage_failed'),
      'behavioural[' + ed.label + '] healthy finalize must raise NO archive_stage_failed — a '
        + 'fixture that always fails would green the fault leg for the wrong reason; findings: '
        + JSON.stringify(ok.findings));
    assert(!ok.findings.includes('archive_unstage_failed'),
      'behavioural[' + ed.label + '] healthy finalize must raise no archive_unstage_failed either; '
        + 'findings: ' + JSON.stringify(ok.findings));
  } finally { destroyFixture(fx); }

  // ---- the fault: the archive staging genuinely cannot write the index ------------------------
  // ADR 0018 §5: `archiveStageCandidates` plants the same two fixed paths Part C already relies on
  // (buildFixture, above) so `existingPaths.length > 0` is genuinely true and the `git add` this
  // leg's assertions are about is genuinely attempted — retirement left this the ONLY way to reach
  // it on a linked run (see buildFixture's comment). A healthy run over this same fixture would
  // stage them cleanly; `lockIndex` below is what makes staging fail.
  fx = buildFixture(ed, { archiveStageCandidates: true });
  try {
    const bad = runFinalize(ed, fx, true);
    assert(bad.status === 0,
      'behavioural[' + ed.label + '] a staging fault must REPORT, not refuse — exit 0 expected, got '
        + bad.status + '\nstderr: ' + bad.stderr);
    assert(bad.tx && bad.tx.archive_stage === 'failed',
      'behavioural[' + ed.label + '] a failed archive staging must record archive_stage=failed, got: '
        + JSON.stringify(bad.tx));
    assert(bad.findings.includes('archive_stage_failed'),
      'behavioural[' + ed.label + '] a failed archive staging must raise the typed finding '
        + 'archive_stage_failed; findings: ' + JSON.stringify(bad.findings));

    const stageSection = findingSection(bad.summary, 'archive_stage_failed');
    assert(stageSection !== null,
      'behavioural[' + ed.label + '] the fault must be written durably under '
        + '"### archive_stage_failed" in ' + bad.summary);

    if (ed.unstageType) {
      // Canonical and Codex name the consequence under their OWN type. The sixth type is not a
      // spare name here: it is the one that says the live folder may still be on the branch.
      assert(bad.findings.includes('archive_unstage_failed'),
        'behavioural[' + ed.label + '] the two-call staging shape must be able to raise '
          + 'archive_unstage_failed; findings: ' + JSON.stringify(bad.findings));
      const unstageSection = findingSection(bad.summary, 'archive_unstage_failed');
      assert(unstageSection !== null,
        'behavioural[' + ed.label + '] archive_unstage_failed must be written durably under '
          + '"### archive_unstage_failed" in ' + bad.summary);
      assert(unstageSection !== null && unstageSection.includes(CANONICAL_LIVE_FOLDER_CLAUSE),
        'behavioural[' + ed.label + '] the archive_unstage_failed section must name the live-run-'
          + 'folder consequence ("' + CANONICAL_LIVE_FOLDER_CLAUSE + '"), got:\n' + unstageSection);
    } else {
      // THE PIN THE FORGE DECISION RESTS ON. The forges are not owed a sixth type precisely
      // because this one message already announces what that type would announce. Reword this
      // clause away and the recorded reasoning stops being true — so it reds here.
      assert(stageSection !== null && stageSection.includes(FORGE_LIVE_FOLDER_CLAUSE),
        'behavioural[' + ed.label + '] the archive_stage_failed section is the ONLY place this '
          + 'edition can announce that the live run folder stays on the branch — it must contain "'
          + FORGE_LIVE_FOLDER_CLAUSE + '", got:\n' + stageSection);
      // Scoped to the finding-type LIST, not to the summary text: a substring search over
      // aggregated output would go green on any prose that happens to mention the name.
      assert(!bad.findings.includes('archive_unstage_failed'),
        'behavioural[' + ed.label + '] the one-call staging shape has no unstage to fail, so '
          + 'archive_unstage_failed must not appear in finalize_transaction.findings; findings: '
          + JSON.stringify(bad.findings));
    }

    // ---- the held lock fails the RESIDUE staging too, which is the other message under test ---
    // Asserted rather than assumed: `residue_stage_failed` carries the same claim on all four
    // editions, and it is also the only condition under which `residue_unstaged` is ever set.
    assert(bad.findings.includes('residue_stage_failed'),
      'behavioural[' + ed.label + '] a held index lock must also fail the residue staging; '
        + 'findings: ' + JSON.stringify(bad.findings));
    assert(bad.tx && bad.tx.residue_stage === 'failed',
      'behavioural[' + ed.label + '] a failed residue staging must record residue_stage=failed, '
        + 'got: ' + JSON.stringify(bad.tx && bad.tx.residue_stage));
    const residueSection = findingSection(bad.summary, 'residue_stage_failed');
    assert(residueSection !== null,
      'behavioural[' + ed.label + '] residue_stage_failed must be written durably under '
        + '"### residue_stage_failed" in ' + bad.summary);

    // ---- no message this fault renders may assert the all-or-nothing property ------------------
    // Three negatives, each with its own witness that the text it searches EXISTS: the two
    // sections are asserted found above, and the stderr anchor below proves warnings were written
    // at all — a run that printed nothing cannot green a "does not contain" over its stderr.
    assert(bad.stderr.includes('WARNING') && bad.stderr.includes(PROJECT),
      'behavioural[' + ed.label + '] the fault run must have written its warnings to stderr, or '
        + 'the stderr assertion below is vacuous; stderr:\n' + bad.stderr);
    assert(bad.stderr.indexOf(ALL_OR_NOTHING_CLAIM) < 0,
      'behavioural[' + ed.label + '] a finalize warning tells the operator `git add` is "'
        + ALL_OR_NOTHING_CLAIM + '". Measured false on git 2.54.0: a gitignored path beside an '
        + 'addable one exits 1 having STAGED the addable one. Report what was measured — the exit '
        + 'code, and the staged set only where it is cheap to read.\nstderr:\n' + bad.stderr);
    assert(stageSection !== null && !stageSection.includes(ALL_OR_NOTHING_CLAIM),
      'behavioural[' + ed.label + '] the archive_stage_failed finding asserts a git property that '
        + 'does not hold ("' + ALL_OR_NOTHING_CLAIM + '"), got:\n' + stageSection);
    assert(residueSection !== null && !residueSection.includes(ALL_OR_NOTHING_CLAIM),
      'behavioural[' + ed.label + '] the residue_stage_failed finding asserts a git property that '
        + 'does not hold ("' + ALL_OR_NOTHING_CLAIM + '"), got:\n' + residueSection);

    // ---- and, for the docs-scope checks at the end of part B, WHICH fields this edition set ----
    unstagedEmitters.set(ed.key, {
      archive: Array.isArray(bad.tx && bad.tx.archive_unstaged),
      residue: Array.isArray(bad.tx && bad.tx.residue_unstaged),
    });
  } finally { destroyFixture(fx); }

  console.log('behavioural[' + ed.label + '] archive-staging fault names the live run folder: done');
}

// =============================================================================================
// C — BEHAVIOURAL: a gitignored archive candidate REPORTS, and reports git's own diagnosis
//
// WHAT THIS LEG USED TO DO, AND WHY IT NO LONGER DOES (#988). It drove the case that falsifies
// "and therefore none of these paths was staged": the archive step's pathspec list held BOTH
// `kaola-workflow/.roadmap` and `kaola-workflow/ROADMAP.md`, a repository could gitignore the
// first, and git would then exit non-zero having STAGED the second — so the run named a path as
// unstaged while `chore: archive` carried it. That contradiction was read back out of the index
// rather than argued from the text, which is what made it a demonstration.
//
// ADR 0018 retired the generated mirror, and #988 removed `kaola-workflow/ROADMAP.md` from the
// candidate list with it. The list is now `['kaola-workflow/.roadmap']` plus, in principle,
// `result.dest` — which on a LINKED run escapes this root and is excluded (#832). One candidate
// cannot be partially staged, so the state this leg demonstrated is not merely untested here: on
// this run shape it can no longer occur. The assertions that rested on a path having been staged
// were DELETED rather than re-pointed, deliberately — see the watch-list note below.
//
// WHAT SURVIVES, and it is not nothing: a gitignored candidate must still make the archive
// staging FAIL, that failure must still REPORT rather than refuse, git's own message must still
// reach the transaction, and the finding must still be written durably. This is now the
// total-failure case, and it is pinned as one.
//
// WATCH LIST, not work. `pathsNotStaged`'s honest-reporting logic is LIVE and still reachable
// where the list genuinely holds two candidates — an in-place run (archive dest + `.roadmap`) and
// the `source-missing` branch. Rebuilding a witness for it would mean adding a second run posture
// to buildFixture, which is machinery for a failure class this repo has not observed on that
// shape; recorded here instead of built. It is NOT evidence that the logic is dead — see the
// marker at pathsNotStaged in claim.js.
//
// GIT'S ACTUAL BEHAVIOUR, re-measured on git 2.54.0 while deciding the above, because the two
// shapes differ and conflating them is what would make a future fixture lie:
//   - two EXPLICIT pathspecs, one ignored  -> exits NON-ZERO, and stages the other one.
//   - one DIRECTORY pathspec whose members are mixed -> exits ZERO, silently skipping the ignored
//     members. So a partial stage cannot be provoked through `kaola-workflow/.roadmap` alone.
//
// Canonical and Codex only: the forge ports make one unscoped `git add -A 'kaola-workflow/'`,
// which SKIPS a gitignored child instead of failing on it, so they have no pathspec list at all.
// =============================================================================================

for (const ed of EDITIONS.filter(e => e.unstageType)) {
  const fx = buildFixture(ed, { ignoredArchivePath: true });
  try {
    const bad = runFinalize(ed, fx, false);
    assert(bad.status === 0,
      'behavioural-C[' + ed.label + '] a staging fault must REPORT, not refuse — exit 0 expected, '
        + 'got ' + bad.status + '\nstdout: ' + bad.stdout + '\nstderr: ' + bad.stderr);
    assert(bad.tx && bad.tx.archive_stage === 'failed',
      'behavioural-C[' + ed.label + '] the gitignored candidate must fail the archive staging, '
        + 'got archive_stage=' + JSON.stringify(bad.tx && bad.tx.archive_stage));
    assert(bad.findings.includes('archive_stage_failed'),
      'behavioural-C[' + ed.label + '] the fault must raise archive_stage_failed; findings: '
        + JSON.stringify(bad.findings));
    // GROUND TRUTH, read out of the index git actually wrote — and read as STATE, never as prose.
    // git localizes its own messages, so a precondition that matched "ignored by one of your
    // .gitignore files" reported "the fixture is broken" on a box whose git speaks Chinese, while
    // the fixture had reproduced the case perfectly. Exit non-zero (archive_stage=failed, above)
    // with ONE candidate in the index and the OTHER out of it fully characterises the partial-
    // stage case in any locale, and no other fault produces that shape: an index lock or an
    // unmatched pathspec leaves both candidates out.
    const trackedIgnored = G.out(fx.wtPath, ['ls-files', '--', IGNORED_ARCHIVE_PATH]);
    assert(trackedIgnored === '',
      'behavioural-C[' + ed.label + '] the gitignored candidate ' + IGNORED_ARCHIVE_PATH + ' reached '
        + 'the index, so this run is not the partial-stage case the assertions below read it as. '
        + 'ls-files: ' + JSON.stringify(trackedIgnored));
    // #988 DELETED FIVE ASSERTIONS HERE, and the reason is recorded rather than left to a diff.
    // Each of them read a path that the failing `git add` had nonetheless STAGED: the witness
    // (`ls-files` finds ADDABLE_ARCHIVE_PATH), `archive_unstaged` not naming it, the two
    // NONE_STAGED_CLAIMS scans over the finding and stderr, and the "Paths not staged:" bullet not
    // listing it. With one candidate in the list there is no staged path on this run, so every one
    // of them would now be asserting something about nothing — and worse, their MESSAGES would go
    // on claiming a contradiction the run no longer produces. A control that stays green while its
    // own message is false is the failure this file exists to catch, so they were removed with the
    // state they described instead of being rewritten to keep passing.
    //
    // The ALL_OR_NOTHING_CLAIM scan went with them for the same reason: its justification here was
    // "on the very run that disproves it", and this run no longer disproves it. Part B still pins
    // that string's absence, and git's real behaviour is recorded in this section's header.

    // git's own diagnosis must ride along in the transaction. Checked for PRESENCE only — its
    // wording is git's and its language is the operator's.
    assert(String((bad.tx && bad.tx.archive_stage_detail) || '').trim() !== '',
      'behavioural-C[' + ed.label + '] archive_stage_detail is empty — git\'s own message is the '
        + 'whole diagnosis of a staging fault and must reach the transaction');

    const section = findingSection(bad.summary, 'archive_stage_failed');
    assert(section !== null,
      'behavioural-C[' + ed.label + '] the fault must be written durably under '
        + '"### archive_stage_failed" in ' + bad.summary);
  } finally { destroyFixture(fx); }

  console.log('behavioural-C[' + ed.label + '] a gitignored archive candidate reports, with git\'s diagnosis: done');
}

// =============================================================================================
// D — BEHAVIOURAL: a path finalize cannot attribute to the run is REPORTED, never adopted
//
// The residue probe pushes every uncommitted non-`kaola-workflow/` path into one list and hands
// that list to `git add -A`, so an artifact that was in the tree for reasons unrelated to the run
// is committed into the repository under `chore: finalize`. Measured at 69264936 on this fixture,
// end to end, at exit 0 and with `findings: ["claim_release_skipped_offline"]` and nothing else:
//
//     chore: finalize issue-914
//       A plugins/plugins                     ls-files --stage: 120000 f4f388c8
//       A plugins/stray.txt
//       M plugins/kaola-workflow/plugin.json
//       A src/helper.js
//       M src/impl.js
//     git status --porcelain afterwards: ""
//
// The last two lines are the run's own work and belong there. The first three do not, and the
// empty status is the reason nothing was ever noticed: the tree finalize left behind is clean.
//
// What is pinned is the RESULT, in both directions, because either one alone is satisfiable by a
// wrong implementation:
//   * the foreign paths are named and NOT in the repository — a classifier that reports and stages
//     anyway has fixed nothing;
//   * the run's own dirt IS swept into the commit exactly as before — a classifier that stages only
//     what it can positively attribute would leave ordinary runs unfinished, which is worse than
//     the fault it replaces. `src/helper.js` is what carries this: it is UNTRACKED, so a rule of
//     "stage only paths the implementation commit already names" reports it as foreign and reds
//     here, which is the point.
// Nothing here asserts an exit code other than 0, and nothing asserts the artifact was removed:
// the finding is a report, and a report that deletes what it found is not one.
//
// The oracle is `git status --porcelain` AFTER the transaction, read as state. It answers both
// directions in one measurement and is blind to the transaction's commit shape — own dirt gone
// means it was committed, a foreign path still dirty means it was neither adopted nor tidied away
// — so a fix that excludes the foreign paths before `git add` and a fix that stages everything and
// un-stages them again are equally acceptable to it. `ls-files` backs it up on the question the
// incident actually turned on, whether the path entered the repository at all; for the tracked
// shape that question is asked of the COMMIT's content instead, because `ls-files` has answered
// "yes" about that path since `main`.
// =============================================================================================

/**
 * Paths git reports as dirty, from the porcelain form these transactions are read in.
 *
 * Deliberately NOT `G.out`, which trims the whole stream. A porcelain record is `XY <path>`, and
 * for an unstaged modification X is a SPACE — so trimming eats the leading space of the FIRST
 * record only, and a `slice(3)` parse then eats the first character of that one pathname.
 * Measured, and it is silent: with untracked paths sorting first the bug does not appear at all,
 * and the moment a ` M` record sorts first the list comes back holding
 * `"lugins/kaola-workflow/plugin.json"`. `-z` for the same reason `probeImplementationCommit`
 * uses it — the non-`-z` stream C-quotes a pathname holding a quote, a backslash or a non-ASCII
 * byte, and does not quote a trailing space.
 */
function dirtyPathsIn(wt) {
  // spawn-class: cli-contract
  const r = spawnSync('git', ['-C', wt, 'status', '--porcelain', '-z'], { encoding: 'utf8' });
  return String(r.stdout || '').split('\0').filter(Boolean).map(rec => rec.slice(3)).sort();
}

for (const ed of EDITIONS) {
  // ---- the fault: three foreign artifacts beside the run's own dirt ----------------------------
  let fx = buildFixture(ed, { implementation: true, ownDirt: true, foreignDirt: true });
  try {
    // ANTI-VACUITY, read BEFORE the run and independent of any implementation. Two ways this
    // fixture could quietly stop testing anything: it could fail to plant a shape (then an
    // assertion about that shape passes by describing an absence), or it could plant the foreign
    // paths somewhere the branch's own commits reach (then "unattributable" is false of them and a
    // correct implementation is required to fail). Both are checked against git, not assumed.
    const dirtyBefore = dirtyPathsIn(fx.wtPath);
    assert(JSON.stringify(dirtyBefore)
        === JSON.stringify([...FOREIGN_ALL, OWN_TRACKED, OWN_UNTRACKED].sort()),
      'behavioural-D[' + ed.label + '] FIXTURE BROKEN: the run must start with all five planted '
        + 'paths dirty — three foreign shapes and the run\'s own two. An assertion about a shape '
        + 'that was never planted passes by describing nothing. dirty: '
        + JSON.stringify(dirtyBefore));
    const branchTouched = G.out(fx.wtPath, ['log', '--name-only', '--pretty=format:', 'main..HEAD'])
      .split('\n').map(s => s.trim()).filter(Boolean);
    assert(branchTouched.includes(OWN_TRACKED),
      'behavioural-D[' + ed.label + '] FIXTURE BROKEN: the branch must have committed ' + OWN_TRACKED
        + ', or the run has no implementation of its own for the foreign paths to be told apart '
        + 'from. Touched: ' + JSON.stringify(branchTouched));
    assert(!branchTouched.some(p => p.startsWith('plugins/')),
      'behavioural-D[' + ed.label + '] FIXTURE BROKEN: the branch\'s own commits reach into '
        + '`plugins/`, so the "foreign" paths are attributable to this run after all and the '
        + 'classification below has nothing to observe. Touched: ' + JSON.stringify(branchTouched));

    const run = runFinalize(ed, fx, false);
    assert(run.status === 0,
      'behavioural-D[' + ed.label + '] an unattributable path is REPORTED, not refused — exit 0 '
        + 'expected, got ' + run.status + '\nstdout: ' + run.stdout + '\nstderr: ' + run.stderr);

    // WITNESS FIRST. Every assertion below is about a transaction that reached the residue step
    // and staged something; a run that refused earlier, or staged nothing at all, would satisfy
    // "the foreign paths are not in the repository" by having done no work whatsoever.
    assert(run.tx && run.tx.impl_commit === 'committed',
      'behavioural-D[' + ed.label + '] WITNESS MISSING: the fixture must present dirt beside a '
        + 'branch that DOES carry an implementation commit, or finalize stops at '
        + 'implementation_commit_missing and never reaches the residue staging under test. '
        + 'impl_commit: ' + JSON.stringify(run.tx && run.tx.impl_commit));
    assert(run.tx && run.tx.residue_stage === 'staged',
      'behavioural-D[' + ed.label + '] WITNESS MISSING: the residue step must have staged this '
        + 'run\'s own dirt. Anything else and the assertions below read a transaction that never '
        + 'did the work. residue_stage: ' + JSON.stringify(run.tx && run.tx.residue_stage));

    // ---- the foreign paths never entered the repository -----------------------------------------
    for (const foreign of FOREIGN_UNTRACKED) {
      assert(G.out(fx.wtPath, ['ls-files', '--', foreign]) === '',
        'behavioural-D[' + ed.label + '] ' + foreign + ' is in the index/tree. The residue probe '
          + 'hands every non-`kaola-workflow/` path to `git add -A`, so an artifact this run did '
          + 'not author is committed under `chore: finalize` — measured at 69264936 as mode 120000 '
          + 'for the symlink. A path finalize cannot attribute to the run is reported, not adopted.');
      // Reported, not tidied away. Nothing in this design deletes what it found. `lstat`, not
      // `existsSync`: the planted symlink resolves to itself, so a following stat answers ELOOP
      // and `existsSync` would report the artifact absent while it sits right there.
      assert(fs.lstatSync(path.join(fx.wtPath, foreign), { throwIfNoEntry: false }) !== undefined,
        'behavioural-D[' + ed.label + '] ' + foreign + ' is gone from the worktree. The finding is '
          + 'a report the orchestrator adjudicates; removing the artifact is a value call that '
          + 'belongs to a human, and it destroys the only evidence of what happened.');
    }
    // The tracked one, whose question is different: it has been in the repository since `main`, so
    // `ls-files` can say nothing about it. What must not have entered is the tampered CONTENT.
    // Read out of the commit, not off the disk — the disk answers whether the file was reverted,
    // which is a different (and forbidden) behaviour, and the two are told apart only here.
    assert(G.out(fx.wtPath, ['show', 'HEAD:' + FOREIGN_TRACKED]).trim()
        === FOREIGN_TRACKED_ORIGINAL.trim(),
      'behavioural-D[' + ed.label + '] the commit at HEAD carries a change to ' + FOREIGN_TRACKED
        + ' that this run did not author. A foreign MODIFICATION to an already-tracked file is the '
        + 'same fault as a foreign new file — the residue probe lists both and `git add -A` takes '
        + 'both — and it is the one an "only untracked paths can be foreign" rule would miss. '
        + 'HEAD content: ' + JSON.stringify(G.out(fx.wtPath, ['show', 'HEAD:' + FOREIGN_TRACKED])));
    assert(fs.readFileSync(path.join(fx.wtPath, FOREIGN_TRACKED), 'utf8')
        === FOREIGN_TRACKED_TAMPERED,
      'behavioural-D[' + ed.label + '] ' + FOREIGN_TRACKED + ' was reverted on disk. The finding '
        + 'reports; it does not repair. Undoing an edit nobody has adjudicated destroys the only '
        + 'evidence of what happened, and it is a value call that belongs to a human.');

    // ---- the run's own dirt was swept in, exactly as before --------------------------------------
    const dirtyAfter = dirtyPathsIn(fx.wtPath);
    assert(JSON.stringify(dirtyAfter) === JSON.stringify([...FOREIGN_ALL].sort()),
      'behavioural-D[' + ed.label + '] after finalize the worktree must hold the three foreign '
        + 'paths and NOTHING else: the run\'s own ' + OWN_TRACKED + ' and ' + OWN_UNTRACKED
        + ' belong in `chore: finalize` and a fix that stops staging them leaves ordinary runs '
        + 'unfinished. expected: ' + JSON.stringify([...FOREIGN_ALL].sort())
        + ', dirty: ' + JSON.stringify(dirtyAfter));
    for (const own of [OWN_TRACKED, OWN_UNTRACKED]) {
      assert(G.out(fx.wtPath, ['ls-files', '--', own]).includes(own),
        'behavioural-D[' + ed.label + '] ' + own + ' is not tracked — this run\'s own '
          + 'implementation dirt must still reach the repository. ls-files: '
          + JSON.stringify(G.out(fx.wtPath, ['ls-files', '--', own])));
    }

    // ---- the typed report, on the envelope and durably --------------------------------------------
    assert(run.findings.includes(UNATTRIBUTED_TYPE),
      'behavioural-D[' + ed.label + '] the run must raise the typed finding ' + UNATTRIBUTED_TYPE
        + '; findings: ' + JSON.stringify(run.findings));
    const named = (run.tx && run.tx[UNATTRIBUTED_FIELD]) || [];
    assert(Array.isArray(run.tx && run.tx[UNATTRIBUTED_FIELD]),
      'behavioural-D[' + ed.label + '] finalize_transaction.' + UNATTRIBUTED_FIELD + ' must be the '
        + 'array of paths the transaction could not attribute — a finding that names no path tells '
        + 'a consumer a foreign artifact exists and not which one. tx: ' + JSON.stringify(run.tx));
    for (const foreign of FOREIGN_ALL) {
      assert(named.includes(foreign),
        'behavioural-D[' + ed.label + '] finalize_transaction.' + UNATTRIBUTED_FIELD + ' omits '
          + foreign + '. All three shapes are planted in ONE run precisely so a classifier reading '
          + 'a path\'s type rather than its provenance cannot pass by catching the shape that '
          + 'happened to be observed. Named: ' + JSON.stringify(named));
    }
    const section = findingSection(run.summary, UNATTRIBUTED_TYPE);
    assert(section !== null,
      'behavioural-D[' + ed.label + '] the finding must be written durably under "### '
        + UNATTRIBUTED_TYPE + '" in ' + run.summary + ' — the envelope scrolls away and the '
        + 'archived record is what the orchestrator reads back');
    for (const foreign of FOREIGN_ALL) {
      assert(section !== null && section.includes(foreign),
        'behavioural-D[' + ed.label + '] the durable ' + UNATTRIBUTED_TYPE + ' section does not '
          + 'name ' + foreign + '. Section:\n' + section);
    }
    // Not a path this run authored. A finding that also names the run's own dirt is the
    // over-reach the staging assertion above catches, stated one surface over.
    for (const own of [OWN_TRACKED, OWN_UNTRACKED]) {
      assert(!named.includes(own),
        'behavioural-D[' + ed.label + '] ' + UNATTRIBUTED_FIELD + ' names ' + own + ', which this '
          + 'run authored and committed. Named: ' + JSON.stringify(named));
    }
  } finally { destroyFixture(fx); }

  // ---- the control: the same run with NO foreign artifact ---------------------------------------
  // The finding must be CAUSED by the artifact. Without this leg an implementation that raises
  // `residue_unattributed` on every finalize would green every assertion above.
  fx = buildFixture(ed, { implementation: true, ownDirt: true });
  try {
    const ok = runFinalize(ed, fx, false);
    assert(ok.status === 0,
      'behavioural-D[' + ed.label + '] control: an ordinary finalize must exit 0, got ' + ok.status
        + '\nstdout: ' + ok.stdout + '\nstderr: ' + ok.stderr);
    assert(!ok.findings.includes(UNATTRIBUTED_TYPE),
      'behavioural-D[' + ed.label + '] control: a run whose only dirt is its own must raise NO '
        + UNATTRIBUTED_TYPE + ' — a finding that always fires would green the fault leg for the '
        + 'wrong reason; findings: ' + JSON.stringify(ok.findings));
    assert(findingSection(ok.summary, UNATTRIBUTED_TYPE) === null,
      'behavioural-D[' + ed.label + '] control: nothing must be written durably under "### '
        + UNATTRIBUTED_TYPE + '" on a run with no foreign artifact');
    const dirtyAfter = dirtyPathsIn(fx.wtPath);
    assert(dirtyAfter.length === 0,
      'behavioural-D[' + ed.label + '] control: the worktree must be clean after finalize — this '
        + 'run\'s own dirt is exactly what `chore: finalize` exists to carry. dirty: '
        + JSON.stringify(dirtyAfter));
  } finally { destroyFixture(fx); }

  console.log('behavioural-D[' + ed.label + '] unattributable finalize residue is reported, not adopted: done');
}

// =============================================================================================
// B — STATIC: the finding-type registries, and the two places docs/api.md states them
// =============================================================================================

/** Every type name this edition can raise, read from its own `recordFinalizeFinding` call sites. */
function registryOf(ed) {
  const src = fs.readFileSync(path.join(repoRoot, ed.claim), 'utf8');
  const re = /recordFinalizeFinding\(\s*'([A-Za-z][A-Za-z0-9_]*)'/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

const registries = new Map();
for (const ed of EDITIONS) {
  const list = registryOf(ed);
  // Shape first: an extractor that matched nothing must not pass the set compares below as
  // `[] === []`, and a duplicated name must not hide inside a Set.
  assert(list.length >= 5,
    'static[' + ed.label + '] the finding-type extractor found ' + list.length + ' call site(s) in '
      + ed.claim + ' — it is not reading the registry');
  assert(new Set(list).size === list.length,
    'static[' + ed.label + '] a finding type is raised from two call sites, which a set compare '
      + 'cannot see: ' + JSON.stringify(list));
  registries.set(ed.key, new Set(list));
}

const canonical = registries.get('canonical');
const codex = registries.get('codex');
const gitlab = registries.get('gitlab');
const gitea = registries.get('gitea');
const sorted = s => [...s].sort();
const minus = (a, b) => sorted(a).filter(x => !b.has(x));

assert(JSON.stringify(sorted(canonical)) === JSON.stringify(sorted(codex)),
  'static: canonical and codex must raise the same finding types; canonical-only: '
    + JSON.stringify(minus(canonical, codex)) + ', codex-only: ' + JSON.stringify(minus(codex, canonical)));
assert(JSON.stringify(sorted(gitlab)) === JSON.stringify(sorted(gitea)),
  'static: gitlab and gitea must raise the same finding types; gitlab-only: '
    + JSON.stringify(minus(gitlab, gitea)) + ', gitea-only: ' + JSON.stringify(minus(gitea, gitlab)));

// The delta is the whole of issue #914, so it is asserted as an exact set both ways rather than
// as a count: a type ADDED to one side and REMOVED from the other keeps every count intact.
for (const [label, forge] of [['gitlab', gitlab], ['gitea', gitea]]) {
  assert(JSON.stringify(minus(canonical, forge)) === JSON.stringify(['archive_unstage_failed']),
    'static: the canonical/' + label + ' finding-type delta must be exactly '
      + '["archive_unstage_failed"], got ' + JSON.stringify(minus(canonical, forge)));
  assert(minus(forge, canonical).length === 0,
    'static: ' + label + ' must raise no finding type canonical does not, got '
      + JSON.stringify(minus(forge, canonical)));
}
assert(canonical.has('archive_unstage_failed'),
  'static: canonical must carry archive_unstage_failed; registry: ' + JSON.stringify(sorted(canonical)));
assert(!gitlab.has('archive_unstage_failed'),
  'static: gitlab must not carry archive_unstage_failed; registry: ' + JSON.stringify(sorted(gitlab)));
assert(!gitea.has('archive_unstage_failed'),
  'static: gitea must not carry archive_unstage_failed; registry: ' + JSON.stringify(sorted(gitea)));

// ---- docs/api.md ------------------------------------------------------------------------------
// Two statements, both falsifiable by a type nobody wrote down. `main_roadmap_mirror_not_regenerated`
// arrived after the counts prose was written, and until the prose caught up the document was wrong
// with nothing reading it.
const apiPath = path.join(repoRoot, 'docs/api.md');
const apiText = fs.readFileSync(apiPath, 'utf8');

const findingsRow = apiText.split('\n').find(l => /^\|\s*`findings`\s*\|/.test(l));
assert(findingsRow !== undefined,
  'static: docs/api.md must carry a `findings` table row enumerating the finding types');
if (findingsRow !== undefined) {
  const cells = findingsRow.split('|');
  const described = cells.slice(2).join('|');
  const listed = (described.match(/`([^`]+)`/g) || [])
    .map(t => t.slice(1, -1))
    .filter(t => /^[a-z][a-z0-9_]*$/.test(t));
  assert(listed.length >= 5,
    'static: the docs `findings` row yielded ' + listed.length + ' type name(s) — the row is not '
      + 'being read: ' + findingsRow);
  assert(JSON.stringify(listed.slice().sort()) === JSON.stringify(sorted(canonical)),
    'static: the docs `findings` row must enumerate exactly the canonical registry.\n'
      + '  documented but not raised: ' + JSON.stringify(listed.filter(t => !canonical.has(t))) + '\n'
      + '  raised but not documented: ' + JSON.stringify(sorted(canonical).filter(t => !listed.includes(t))));
}

const WORD_TO_INT = Object.freeze({
  three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
});
const flat = apiText.replace(/\s+/g, ' ');
const countSentence = /raise \*\*([a-z]+)\*\* finding types where canonical and Codex raise \*\*([a-z]+)\*\*/.exec(flat);
assert(countSentence !== null,
  'static: docs/api.md must state the per-edition finding-type counts in the form "raise **<n>** '
    + 'finding types where canonical and Codex raise **<m>**" — the sentence was not found, so '
    + 'nothing is checking the numbers. Re-point this pin at the rewritten sentence.');
if (countSentence !== null) {
  assert(WORD_TO_INT[countSentence[1]] === gitlab.size,
    'static: docs/api.md says the forge ports raise ' + countSentence[1] + ' finding types; measured '
      + gitlab.size + ' (' + JSON.stringify(sorted(gitlab)) + ')');
  assert(WORD_TO_INT[countSentence[2]] === canonical.size,
    'static: docs/api.md says canonical and Codex raise ' + countSentence[2] + ' finding types; '
      + 'measured ' + canonical.size + ' (' + JSON.stringify(sorted(canonical)) + ')');
}

// ---- the two `*_unstaged` rows: documented SCOPE against measured emission --------------------
// The `findings` row above is checked for CONTENT; these two are checked for SCOPE, which is a
// different failure and one nothing else can see. A field only some editions set, documented with
// no qualifier, reads as universal to someone who has no way to find out otherwise. The
// measurement comes from part A, where every edition ran a fault that failed BOTH its archive
// staging and its residue staging — the only condition under which either field is ever set.
//
// The two demands are OPPOSITE by construction, so a blanket edit over this table cannot satisfy
// both: whichever row is genuinely universal must stay unqualified.
const EDITION_WORD = Object.freeze({
  canonical: /canonical|GitHub/i,
  codex: /codex/i,
  gitlab: /gitlab/i,
  gitea: /gitea/i,
});
const EDITION_KEYS = EDITIONS.map(e => e.key);
const docsRow = name => apiText.split('\n').find(l => new RegExp('^\\|\\s*`' + name + '`\\s*\\|').test(l));
const editionsNamedIn = row => EDITION_KEYS.filter(k => EDITION_WORD[k].test(row));

// Positive control for the matcher, on a REAL row of this document. Without it, a regex set that
// matched nothing would pass the "no qualifier" assertion below as a success and fail the "must be
// scoped" one for the wrong reason.
//
// ADR 0018 §8 step 5 deleted `kaola-workflow-roadmap.js` in all four editions, and with it the whole
// `## Roadmap Operations` section of docs/api.md — `migrate` (the row this control used to read) is
// gone along with the mechanism it documented, not renamed. `docsRow('migrate') === undefined` is
// therefore the honest, correct answer now, not a bug to route around: the mechanism this control
// exists to protect (editionsNamedIn's regex matcher) is not retired, only its witness died — the
// same shape as `seedClassifierVerdictFromBody` and `test-forge-bundle-lane.js`'s classifier seam elsewhere in
// this run. Re-pointed at a row verified still present, by reading the live file rather than
// remembering the old one: `docs/api.md`'s install-manifest row is the ONLY OTHER table row in the
// entire document whose own text names both GitLab and Gitea (confirmed by grepping every `|`-led
// line in the file for both substrings) — its key literally enumerates
// `--forge=<github|gitlab|gitea>`. (`archive_unstaged`'s row also names both, but that row is the
// SUBJECT the assertions below already read — reusing it here would make the control depend on the
// very thing it exists to protect, not an independent check.)
//
// Looked up by a distinctive substring rather than through `docsRow(name)`: the install-manifest
// row's own KEY contains unescaped `|` characters (markdown's own escape for a literal pipe inside a
// table cell — `\|`), which `docsRow`'s `new RegExp('...`' + name + '`...')` would read as regex
// alternation, not literal text, if the raw key were threaded through it as `name`.
const installManifestRow = apiText.split('\n')
  .find(l => l.startsWith('|') && l.includes('kaola-workflow-install-manifest.js'));
assert(installManifestRow !== undefined
    && editionsNamedIn(installManifestRow).includes('gitlab') && editionsNamedIn(installManifestRow).includes('gitea'),
  'static: the edition-name matcher failed its positive control — docs/api.md\'s install-manifest '
    + 'row names GitLab and Gitea (as `--forge=<github|gitlab|gitea>`) and the matcher must see '
    + 'both. Row: ' + installManifestRow);

assert(unstagedEmitters.size === EDITIONS.length,
  'static: the *_unstaged emission measurement covers ' + unstagedEmitters.size + ' of '
    + EDITIONS.length + ' editions — part A did not reach the fault everywhere, so the scope '
    + 'checks below have nothing to compare the docs against');
const emittersOf = field => EDITION_KEYS.filter(k => {
  const m = unstagedEmitters.get(k);
  return !!(m && m[field]);
});

const archiveEmitters = emittersOf('archive');
const archiveRow = docsRow('archive_unstaged');
assert(archiveRow !== undefined,
  'static: docs/api.md must carry an `archive_unstaged` table row — its scope is unchecked if the '
    + 'row cannot be found. Re-point this pin at the renamed row.');
assert(archiveEmitters.length > 0,
  'static: docs/api.md documents `archive_unstaged` and no edition sets it on a run whose archive '
    + 'staging failed — the row documents a field that does not exist');
if (archiveRow !== undefined) {
  const silent = EDITION_KEYS.filter(k => !archiveEmitters.includes(k));
  const named = editionsNamedIn(archiveRow);
  // Either acceptable fix passes: scope the row to the divergence (naming that whole group, from
  // either side), or emit the field everywhere it is documented.
  const scoped = archiveEmitters.every(k => named.includes(k))
    || (silent.length > 0 && silent.every(k => named.includes(k)));
  assert(silent.length === 0 || scoped,
    'static: docs/api.md documents `archive_unstaged` with no edition qualifier, but only '
      + JSON.stringify(archiveEmitters) + ' set it — ' + JSON.stringify(silent) + ' never did on a '
      + 'run whose archive staging FAILED, which is the only run that could. Either scope the row '
      + 'to the divergence (naming the whole group, emitters or silent ones) or emit the field on '
      + 'every edition the row speaks for.\n  row: ' + archiveRow
      + '\n  editions named in the row: ' + JSON.stringify(named));
}

const residueEmitters = emittersOf('residue');
const residueRow = docsRow('residue_unstaged');
assert(residueRow !== undefined,
  'static: docs/api.md must carry a `residue_unstaged` table row. Re-point this pin at the '
    + 'renamed row.');
assert(JSON.stringify(residueEmitters) === JSON.stringify(EDITION_KEYS),
  'static: `residue_unstaged` is documented unconditionally, so every edition must set it on a '
    + 'failed residue staging; measured emitters: ' + JSON.stringify(residueEmitters)
    + ' of ' + JSON.stringify(EDITION_KEYS));
if (residueRow !== undefined) {
  const named = editionsNamedIn(residueRow);
  assert(named.length === 0,
    'static: `residue_unstaged` IS emitted by every edition (' + JSON.stringify(residueEmitters)
      + '), so its row must carry no edition qualifier — a blanket edit that scoped this row '
      + 'alongside `archive_unstaged` would make an accurate row wrong. Named: '
      + JSON.stringify(named) + '\n  row: ' + residueRow);
}

console.log('static: finding-type registries and their docs/api.md statements: done');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
