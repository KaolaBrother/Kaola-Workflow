#!/usr/bin/env node
'use strict';

// test-forge-archive-scoping.js — what archiving is allowed to touch, per edition. Two sections:
// which paths the `chore: archive` commit may carry (below), and which DIRECTORIES archiving may
// move at all (the #930 section at the foot of the file).
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// The four `claim.js` copies are HAND-PORTED, and the archive-staging step is one of the places
// they genuinely diverge. `validate-script-sync.js` compares only `scripts/<name>` against
// `plugins/kaola-workflow/scripts/<name>`, so the forge-renamed `kaola-<forge>-workflow-claim.js`
// is compared to nothing; it is in neither COMMON_SCRIPTS nor RENAME_NORMALIZED_FAMILIES. No
// parity check, no byte-identity guard and no export superset can witness a difference in WHICH
// PATHS a `git add` reaches — that is a runtime fact about an index, not a fact about a file. So
// this suite is behavioural, per edition, driving the real CLI.
//
// What it measures, and why the measurement is the commit rather than the exit code
// --------------------------------------------------------------------------------
// The failure this pins is not a failure. It SUCCEEDS: exit 0, `archive_stage: "staged"`, an
// ordinary-looking `chore: archive <project>` commit — which quietly also carries another
// project's live run folder and another project's archive band, swept in by a pathspec that names
// the whole of `kaola-workflow/`. Nothing in the finding-type registry can reach it, because
// nothing went wrong. The only place the difference is visible is the SET OF PATHS the run put
// into the index, so that set is what every assertion below reads.
//
// The fixture carries four kinds of dirt in the linked worktree, none of it belonging to the
// project being finalized:
//   * a foreign project's LIVE folder          kaola-workflow/<foreign>/            (modified + untracked)
//   * a foreign project's ARCHIVE band         kaola-workflow/archive/<foreign>/    (modified + untracked)
//   * a foreign project whose name has this project's name as a PREFIX
//                                              kaola-workflow/<project>0/           (modified)
//   * the project's OWN earlier archive band   kaola-workflow/archive/<project>.archived-…/
// The first three must never enter the commit. The fourth must — it is this project's own record,
// and a scoping fix that loses it has traded one defect for another.
//
// Non-vacuity is mechanical, never a claim in a comment:
//   * every "must not appear" assertion is preceded by a shape guard that the run REACHED the
//     staging step (exit 0 and `archive_stage: "staged"`) and produced a `chore: archive` commit
//     to inspect — a finalize that refused early would otherwise green all of them;
//   * the foreign dirt is re-read from `git status --porcelain` immediately before the run, so a
//     fixture that silently failed to make anything dirty cannot pass as "nothing foreign staged";
//   * the live-folder removal is asserted against the commit's TREE, with the parent tree asserted
//     to still hold the folder — a run that never had the folder cannot pass the removal pin.
//
// Usage
//   node scripts/test-forge-archive-scoping.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

// This box has no global `init.defaultBranch` and the fixtures below must not inherit whatever a
// developer's global config says about excludes, autocrlf or safe.directory either: the archive
// disposition classifier reads git's own ignore rules, so a stray global `core.excludesFile` would
// change what this suite measures. Neutralised for the fixture git calls AND for the spawned CLI,
// which inherits this environment.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_SYSTEM = '/dev/null';

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

const EDITIONS = Object.freeze([
  {
    key: 'canonical',
    label: 'claude/canonical',
    claim: 'scripts/kaola-workflow-claim.js',
    schema: 'scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: [],
  },
  {
    key: 'codex',
    label: 'codex',
    claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    schema: 'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: [],
  },
  {
    key: 'gitlab',
    label: 'gitlab',
    claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    schema: 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: ['## GitLab', 'issue_iid: 1', 'project_id: 77', 'path_with_namespace: g/p', ''],
  },
  {
    key: 'gitea',
    label: 'gitea',
    claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
    schema: 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: ['## Gitea', 'issue_iid: 1', 'full_name: g/p',
      'project_html_url: https://gitea.example/g/p', ''],
  },
]);

const PROJECT = 'issue-922';
const FOREIGN = 'issue-777';
const SIBLING = PROJECT + '0';          // a DIFFERENT project, whose name starts with PROJECT
const OWN_BAND = PROJECT + '.archived-2026-01-01';

const FOREIGN_LIVE = 'kaola-workflow/' + FOREIGN + '/';
const FOREIGN_BAND = 'kaola-workflow/archive/' + FOREIGN + '/';
const SIBLING_LIVE = 'kaola-workflow/' + SIBLING + '/';
const PROJECT_LIVE = 'kaola-workflow/' + PROJECT + '/';
const OWN_BAND_DIR = 'kaola-workflow/archive/' + OWN_BAND + '/';

// The foreign dirt, by the porcelain path each piece must show up as before the run. Read back
// from git rather than assumed: a fixture whose writes landed somewhere unexpected would otherwise
// satisfy "no foreign path was staged" for the wrong reason.
const FOREIGN_DIRT = Object.freeze([
  FOREIGN_LIVE + 'mission-list.md',
  FOREIGN_LIVE + 'untracked-note.md',
  FOREIGN_BAND + 'workflow-state.md',
  FOREIGN_BAND + 'stray.md',
  SIBLING_LIVE + 'workflow-state.md',
]);

/**
 * A linked-worktree finalize fixture: `main` holds the live run folder, and a linked worktree on
 * the feature branch holds its own copy plus the foreign dirt. This is the shape
 * `finalize --keep-worktree` is invoked in, and the only shape in which the archive-staging step
 * runs at all (it is guarded on `mainRoot !== linkedRoot`).
 */
function buildFixture(ed) {
  const mainRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw922-' + ed.key + '-')));
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
  // The neighbourhood the project is finalized INSIDE: a roadmap mirror with a source file for it,
  // two other projects, and both archive bands. All of it COMMITTED, so the dirt planted below is a
  // modification of tracked content and not merely an untracked file git might treat differently.
  const writeNeighbourhood = root => {
    const kw = path.join(root, 'kaola-workflow');
    fs.mkdirSync(path.join(kw, '.roadmap'), { recursive: true });
    fs.writeFileSync(path.join(kw, '.roadmap', 'issue-1.md'), '# 1 — the project being finalized\n');
    fs.writeFileSync(path.join(kw, 'ROADMAP.md'), '# Roadmap\n\n- #1 the project being finalized\n');
    fs.mkdirSync(path.join(kw, FOREIGN), { recursive: true });
    fs.writeFileSync(path.join(kw, FOREIGN, 'workflow-state.md'),
      '# Kaola-Workflow State\n\n## Project\nname: ' + FOREIGN + '\nstatus: active\n');
    fs.writeFileSync(path.join(kw, FOREIGN, 'mission-list.md'), '# a foreign run\n\nuntouched\n');
    fs.mkdirSync(path.join(kw, SIBLING), { recursive: true });
    fs.writeFileSync(path.join(kw, SIBLING, 'workflow-state.md'),
      '# Kaola-Workflow State\n\n## Project\nname: ' + SIBLING + '\nstatus: active\n');
    fs.mkdirSync(path.join(kw, 'archive', FOREIGN), { recursive: true });
    fs.writeFileSync(path.join(kw, 'archive', FOREIGN, 'workflow-state.md'), '# a foreign archive\nstatus: closed\n');
    fs.mkdirSync(path.join(kw, 'archive', OWN_BAND), { recursive: true });
    fs.writeFileSync(path.join(kw, 'archive', OWN_BAND, 'workflow-state.md'), '# this project, archived earlier\n');
  };
  // The dirt, planted in the WORKTREE only, after the commit — this is the state a real run is in
  // when a concurrent project's folder is being written beside it.
  const dirtyForeign = root => {
    const kw = path.join(root, 'kaola-workflow');
    fs.writeFileSync(path.join(kw, FOREIGN, 'mission-list.md'), '# a foreign run\n\nIN FLIGHT\n');
    fs.writeFileSync(path.join(kw, FOREIGN, 'untracked-note.md'), 'foreign, untracked\n');
    fs.writeFileSync(path.join(kw, SIBLING, 'workflow-state.md'),
      '# Kaola-Workflow State\n\n## Project\nname: ' + SIBLING + '\nstatus: active\nIN FLIGHT\n');
    fs.writeFileSync(path.join(kw, 'archive', FOREIGN, 'workflow-state.md'), '# a foreign archive\nstatus: closed\nEDITED\n');
    fs.writeFileSync(path.join(kw, 'archive', FOREIGN, 'stray.md'), 'foreign archive, untracked\n');
    // The project's OWN band, dirtied the same way — the positive half of the same rule.
    fs.writeFileSync(path.join(kw, 'archive', OWN_BAND, 'workflow-state.md'), '# this project, archived earlier\nEDITED\n');
    fs.writeFileSync(path.join(kw, 'archive', OWN_BAND, 'own-stray.md'), 'this project, untracked\n');
  };

  G.init(mainRoot, { branch: 'main' });
  fs.writeFileSync(path.join(mainRoot, 'README.md'), 'init\n');
  G.commitAll(mainRoot, 'init');
  fs.mkdirSync(kwRoot, { recursive: true });
  G.exec(mainRoot, ['worktree', 'add', '-b', 'workflow/' + PROJECT, '--', wtPath, 'main'],
    { encoding: 'utf8', stdio: 'pipe' });

  writeState(wtPath); seed(wtPath); writeNeighbourhood(wtPath);
  G.commitPaths(wtPath, ['kaola-workflow/'], 'chore: finalize ' + PROJECT);

  writeState(mainRoot); seed(mainRoot); writeNeighbourhood(mainRoot);
  G.commitPaths(mainRoot, ['kaola-workflow/'], 'mirror: live folder on main');

  dirtyForeign(wtPath);

  return { mainRoot, kwRoot, wtPath };
}

function destroyFixture(fx) {
  try { G.exec(fx.mainRoot, ['worktree', 'remove', '--force', fx.wtPath], { encoding: 'utf8' }); } catch (_) { /* best effort */ }
  fs.rmSync(fx.mainRoot, { recursive: true, force: true });
  fs.rmSync(fx.kwRoot, { recursive: true, force: true });
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

/**
 * Every path a commit touched. `--no-renames` is deliberate: a rename would otherwise collapse two
 * paths into one line, and the question here is only ever "did anything under this prefix enter
 * the commit", for which an old name counts exactly as much as a new one.
 */
function commitPathsOf(repo, sha) {
  const out = G.out(repo, ['diff-tree', '-r', '--no-commit-id', '--no-renames', '--name-only', sha]);
  return out ? out.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

/** Every path present in the tree AT `sha`. */
function treePathsOf(repo, sha) {
  const out = G.out(repo, ['ls-tree', '-r', '--name-only', sha]);
  return out ? out.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

/** Paths still sitting in the index when the run ended — staged but never committed. */
function indexPathsOf(repo) {
  const out = G.out(repo, ['diff', '--cached', '--no-renames', '--name-only', 'HEAD']);
  return out ? out.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

const under = (paths, prefix) => paths.filter(p => p.startsWith(prefix));

for (const ed of EDITIONS) {
  const fx = buildFixture(ed);
  try {
    const before = G.out(fx.wtPath, ['rev-parse', 'HEAD']);

    // Shape, read from git rather than assumed: the foreign dirt must actually BE dirt, or every
    // "no foreign path was staged" assertion below is true for a reason that has nothing to do
    // with the pathspec under test.
    // Raw stdout, NOT the trimmed helper: porcelain's status column is two characters wide and the
    // first is a space for an unstaged edit, so trimming the whole block eats one column off line 1.
    const porcelain = String(G.git(fx.wtPath, ['status', '--porcelain']).stdout || '');
    const dirty = porcelain.split('\n')
      .map(l => { const m = /^..\s(.*)$/.exec(l); return m ? m[1].trim() : ''; })
      .filter(Boolean);
    for (const p of FOREIGN_DIRT) {
      assert(dirty.includes(p),
        'shape[' + ed.label + '] the fixture must present ' + p + ' as uncommitted work before '
          + 'finalize runs, or the scoping assertions are vacuous; git status said:\n' + porcelain);
    }

    // spawn-class: cli-contract
    const r = spawnSync(process.execPath,
      [path.join(repoRoot, ed.claim), 'finalize', '--project', PROJECT, '--keep-worktree'],
      { cwd: fx.wtPath, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    const env = parseEnvelope(r.stdout);
    const tx = (env && env.finalize_transaction) || null;

    assert(r.status === 0,
      'shape[' + ed.label + '] finalize must exit 0, got ' + r.status
        + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    // The defect this suite exists for is a SUCCESS, so the staging step having reported success is
    // the precondition for reading anything into what it did or did not stage.
    assert(tx && tx.archive_stage === 'staged',
      'shape[' + ed.label + '] the archive staging step must have run and reported staged — a run '
        + 'that never staged anything would satisfy every scoping assertion below; transaction: '
        + JSON.stringify(tx));

    // The commits this run produced, and the one that carries the archive.
    const newShas = (G.out(fx.wtPath, ['rev-list', '--reverse', before + '..HEAD']) || '')
      .split('\n').map(s => s.trim()).filter(Boolean);
    let archiveSha = null;
    for (const sha of newShas) {
      if (G.out(fx.wtPath, ['log', '-1', '--format=%s', sha]) === 'chore: archive ' + PROJECT) archiveSha = sha;
    }
    assert(archiveSha !== null,
      'shape[' + ed.label + '] the run must produce a `chore: archive ' + PROJECT + '` commit to '
        + 'inspect; commits made: ' + JSON.stringify(newShas.map(s => G.out(fx.wtPath, ['log', '-1', '--format=%s', s]))));
    if (archiveSha === null) { destroyFixture(fx); continue; }

    const archivePaths = commitPathsOf(fx.wtPath, archiveSha);
    // Everything the run put into git AT ALL: each commit it made, plus anything left staged. A fix
    // that moves the foreign sweep from the archive commit into the finalize commit is not a fix,
    // and neither is one that leaves the foreign paths sitting in the index.
    const landed = new Set(indexPathsOf(fx.wtPath));
    for (const sha of newShas) for (const p of commitPathsOf(fx.wtPath, sha)) landed.add(p);
    const landedList = [...landed];

    // ---- 1. a foreign project's LIVE folder --------------------------------------------------
    assert(under(archivePaths, FOREIGN_LIVE).length === 0,
      'scoping[' + ed.label + '] the `chore: archive ' + PROJECT + '` commit must not carry another '
        + 'project\'s live run folder; it carried: ' + JSON.stringify(under(archivePaths, FOREIGN_LIVE)));
    assert(under(landedList, FOREIGN_LIVE).length === 0,
      'scoping[' + ed.label + '] no commit or staged path this finalize produced may carry another '
        + 'project\'s live run folder; it carried: ' + JSON.stringify(under(landedList, FOREIGN_LIVE)));
    // The same rule at its hardest instance: a project whose NAME BEGINS with this project's name
    // is still a foreign project. A prefix test would sweep it in and read as scoped.
    assert(under(landedList, SIBLING_LIVE).length === 0,
      'scoping[' + ed.label + '] `' + SIBLING + '` is a DIFFERENT project from `' + PROJECT
        + '` — its live folder must not enter this finalize\'s commits; it carried: '
        + JSON.stringify(under(landedList, SIBLING_LIVE)));

    // ---- 2. a foreign project's ARCHIVE band -------------------------------------------------
    assert(under(archivePaths, FOREIGN_BAND).length === 0,
      'scoping[' + ed.label + '] the `chore: archive ' + PROJECT + '` commit must not carry another '
        + 'project\'s archive band; it carried: ' + JSON.stringify(under(archivePaths, FOREIGN_BAND)));
    assert(under(landedList, FOREIGN_BAND).length === 0,
      'scoping[' + ed.label + '] no commit or staged path this finalize produced may carry another '
        + 'project\'s archive band; it carried: ' + JSON.stringify(under(landedList, FOREIGN_BAND)));

    // ---- 3. the project's OWN paths still land -----------------------------------------------
    // The roadmap-mirror-carried and roadmap-source-removal assertions stood here. ADR 0018 §5
    // retired reconcileRoadmapForClosure — finalize no longer unlinks a roadmap source or
    // regenerates a mirror, so the archive commit on a linked run has no positive payload left to
    // require; deleted with the mechanism.
    // The project's own archive band is its own record. Asserted over everything the run committed
    // rather than over the archive commit alone: which of the two commits carries it is a design
    // choice the editions already make differently, and pinning that would freeze an incidental.
    assert(under(landedList, OWN_BAND_DIR).length === 2,
      'regression[' + ed.label + '] this project\'s own archive band ' + OWN_BAND_DIR + ' must '
        + 'still reach a commit — both the edit and the untracked file; the run committed: '
        + JSON.stringify(under(landedList, OWN_BAND_DIR)));

    // ---- 4. the live run folder is forced OUT of the branch ----------------------------------
    // The archive commit exists to take the live folder off the branch. The forge ports get this
    // today as a side effect of sweeping all of `kaola-workflow/` — a scoping fix that names only
    // the roadmap and the archive destination would silently stop doing it, which is why this is
    // asserted against the TREE and not against the commit's path list.
    const parentTree = treePathsOf(fx.wtPath, archiveSha + '^');
    assert(under(parentTree, PROJECT_LIVE).length > 0,
      'shape[' + ed.label + '] the branch must still carry ' + PROJECT_LIVE + ' BEFORE the archive '
        + 'commit, or its removal cannot be observed; parent tree held: '
        + JSON.stringify(under(parentTree, PROJECT_LIVE)));
    const archiveTree = treePathsOf(fx.wtPath, archiveSha);
    assert(under(archiveTree, PROJECT_LIVE).length === 0,
      'regression[' + ed.label + '] the `chore: archive ' + PROJECT + '` commit must leave NO path '
        + 'under ' + PROJECT_LIVE + ' on the branch — that removal is what the commit is for; still '
        + 'on the branch: ' + JSON.stringify(under(archiveTree, PROJECT_LIVE)));

    console.log('scoping[' + ed.label + '] archive commit ' + archiveSha.slice(0, 8) + ' carried '
      + archivePaths.length + ' path(s): done');
  } finally { destroyFixture(fx); }
}

// =============================================================================================
// #930 — archiving must never relocate a directory that is not a project folder. PER EDITION.
//
// This section widens the file's remit from "which paths the archive commit carries" to "what
// archiving is allowed to move at all", and it is here for the same reason the rest of the file
// is: the four `archiveProjectDir` copies are HAND-PORTED, and no parity check in the tree can
// witness a difference between them. Mutating the root copy alone makes validate-script-sync
// exit 1; mutating root AND the github plugin makes it exit 0, and a gitlab-only change is
// invisible to both validate-script-sync and edition-sync --check. So an incomplete four-copy
// fix ships silently unless a behavioural pin drives each edition's own CLI — which is what the
// EDITIONS table above already exists to do.
//
// The defect: `workflow_project:` is adopted verbatim and filtered only by isSafeName, which
// rejects nothing but the empty string, `.`, `..`, a separator and NUL. `.roadmap` passes, the
// claim writes workflow-state.md into kaola-workflow/.roadmap/ beside the roadmap SOURCES, and
// finalize archives "the project" — carrying _rules.md, .gitkeep and every unrelated issue-*.md
// into kaola-workflow/archive/.roadmap/, in BOTH checkouts, and committing the deletion onto the
// branch the sink merges to main. Exit 0.
//
// The RESULT is pinned, never the mechanism: refusing, resolving the name, or anything else all
// satisfy it. Only content that predates the claim is pinned — the run's OWN roadmap source
// (issue-1.md) may be removed by closure, which is the documented contract.
//
// Two names, because a name-equality test on the caller-supplied string is not a test about the
// directory it protects. `.roadmap` is the filed case. `Archive` is the SAME directory as
// `archive` wherever the filesystem is case-insensitive (APFS, NTFS by default), so it reaches
// `archiveProjectDir` with the whole archive band as its source. That arm runs only where the
// aliasing is real — probed, not assumed — and pins the same result there, never a casing rule.
// =============================================================================================

// Probed: it decides whether `Archive` and `archive` name the same directory, and so whether the
// aliasing arm has a subject at all.
const CASE_PROBE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw930-caseprobe-')));
fs.writeFileSync(path.join(CASE_PROBE, 'CaseProbe'), '');
const CASE_INSENSITIVE_FS = fs.existsSync(path.join(CASE_PROBE, 'caseprobe'));
fs.rmSync(CASE_PROBE, { recursive: true, force: true });

// The only file finalize is KNOWN to create inside the project folder before it reaches the
// archive step. Named rather than tolerated silently, so the next addition cannot arrive unseen.
const KNOWN_ADDITIONS = new Set(['finalization-summary.md']);

const RESERVED_SPECS = [
  {
    key: 'roadmap',
    dir: '.roadmap',                 // the directory on disk
    given: '.roadmap',               // the name the caller supplies
    foreign: {
      '.gitkeep': '',
      '_rules.md': '# Project rules\n\nEvery run reads this file.\n',
      'issue-930.md': 'issue: #930\ntitle: unrelated backlog item\nstatus: open\nworkflow_project: —\nnext_step: ready\n',
    },
    // `archive/.roadmap` must never come into being: `.roadmap` reaches no refusal that could
    // legitimately leave a partial copy of itself inside the archive band.
    forbidDest: true,
    // The RUN's own roadmap source lands in this same directory, so the branch carries it too.
    // Closure may remove it, which is why it is not `foreign` — but the shape check must expect it.
    alsoOnBranch: ['issue-1.md'],
  },
  {
    key: 'archive-case',
    dir: 'archive',
    given: 'Archive',
    skip: !CASE_INSENSITIVE_FS,
    foreign: {
      'issue-900/workflow-state.md': '# Kaola-Workflow State\n\n## Project\nname: issue-900\nstatus: closed\n',
      'issue-900/mission-list.md': '# a prior run record\n',
    },
    // An attempt on the band that ends in refusal can leave a partial self-copy behind, which
    // destroys nothing. Preservation, the SET and honesty carry this arm.
    forbidDest: false,
  },
];

function buildReservedFixture(ed, spec) {
  const mainRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw930-' + spec.key + '-' + ed.key + '-')));
  const kwRoot = mainRoot + '.kw';
  const wtPath = path.join(kwRoot, 'reserved');
  const schema = require(path.join(repoRoot, ed.schema));

  // The reserved directory's own content, plus the RUN's own roadmap source.
  const writeReserved = root => {
    const dir = path.join(root, 'kaola-workflow', spec.dir);
    for (const [rel, body] of Object.entries(spec.foreign)) {
      const f = path.join(dir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, body);
    }
    const roadmap = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmap, { recursive: true });
    fs.writeFileSync(path.join(roadmap, 'issue-1.md'), '# 1 — the issue this run closes\n');
    fs.writeFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), '# Roadmap\n\n- #1 the run\n');
  };
  // The claim's own state, written INTO the reserved directory under the name the caller gave —
  // exactly what claiming a project by that name produces.
  const writeState = root => {
    const dir = path.join(root, 'kaola-workflow', spec.given);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + spec.given, 'status: active', '',
    ].concat(ed.stateForgeSection, [
      '## Sink', 'branch: workflow/reserved-930', 'issue_number: 1', 'sink: merge',
      'worktree_path: ' + wtPath, '',
    ]).join('\n'));
  };
  const seed = root => {
    const dir = path.join(root, 'kaola-workflow', spec.given, '.cache');
    fs.mkdirSync(dir, { recursive: true });
    let hash = '';
    try { hash = schema.computeCodeTreeHash(root, spec.given, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { hash = ''; }
    fs.writeFileSync(path.join(dir, 'final-validation.md'),
      'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + hash + '\n');
  };

  G.init(mainRoot, { branch: 'main' });
  fs.writeFileSync(path.join(mainRoot, 'README.md'), 'init\n');
  G.commitAll(mainRoot, 'init');
  // The reserved directory is TRACKED before the run — the deletion has to be observable in git.
  writeReserved(mainRoot);
  G.commitAll(mainRoot, 'seed reserved directory');
  fs.mkdirSync(kwRoot, { recursive: true });
  G.exec(mainRoot, ['worktree', 'add', '-b', 'workflow/reserved-930', '--', wtPath, 'main'],
    { encoding: 'utf8', stdio: 'pipe' });

  writeState(wtPath); seed(wtPath);
  writeState(mainRoot); seed(mainRoot);

  return { mainRoot, kwRoot, wtPath };
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

for (const spec of RESERVED_SPECS) {
  if (spec.skip) {
    console.log('930[all editions] skipped ' + JSON.stringify(spec.given)
      + ': this filesystem is case-sensitive, so it does not alias the reserved directory');
    continue;
  }
  const LIVE = 'kaola-workflow/' + spec.dir + '/';
  for (const ed of EDITIONS) {
    const tag = '930[' + ed.label + '/' + spec.given + ']';
    const fx = buildReservedFixture(ed, spec);
    try {
      // Shape, read from disk and from git rather than assumed: every preservation assertion below
      // is vacuous against a fixture that never had the files.
      for (const rel of Object.keys(spec.foreign)) {
        assert(fs.existsSync(path.join(fx.wtPath, 'kaola-workflow', spec.dir, rel))
            && fs.existsSync(path.join(fx.mainRoot, 'kaola-workflow', spec.dir, rel)),
          'shape[' + ed.label + '] both checkouts must hold ' + LIVE + rel + ' before finalize runs');
      }
      const seededTree = treePathsOf(fx.wtPath, 'HEAD');
      const expectedOnBranch = Object.keys(spec.foreign).concat(spec.alsoOnBranch || [])
        .map(rel => LIVE + rel).sort();
      assert(JSON.stringify(under(seededTree, LIVE).sort()) === JSON.stringify(expectedOnBranch),
        'shape[' + ed.label + '] the feature branch must carry exactly the seeded reserved directory '
          + 'before finalize, or its removal cannot be observed; expected '
          + JSON.stringify(expectedOnBranch) + ', branch held: ' + JSON.stringify(under(seededTree, LIVE)));
      const before = {
        main: listTree(path.join(fx.mainRoot, 'kaola-workflow', spec.dir)),
        worktree: listTree(path.join(fx.wtPath, 'kaola-workflow', spec.dir)),
      };

      // spawn-class: cli-contract
      const r = spawnSync(process.execPath,
        [path.join(repoRoot, ed.claim), 'finalize', '--project', spec.given, '--keep-worktree'],
        { cwd: fx.wtPath, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
      const env = parseEnvelope(r.stdout) || {};

      // (1) THE DEMANDED RESULT: the reserved directory and its own content are still in place, in
      // every checkout, byte for byte.
      for (const [rootLabel, root] of [['main', fx.mainRoot], ['worktree', fx.wtPath]]) {
        for (const [rel, body] of Object.entries(spec.foreign)) {
          const f = path.join(root, 'kaola-workflow', spec.dir, rel);
          assert(fs.existsSync(f) && fs.readFileSync(f, 'utf8') === body,
            tag + ' the ' + rootLabel + ' checkout lost or altered ' + LIVE + rel
              + ' — archiving relocated a directory that is not a project folder'
              + '\nexit: ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
        }
      }

      // (1b) THE DIRECTORY AS A SET. Presence-and-bytes cannot see a file ADDED inside the reserved
      // directory, so a future step could quietly write into a directory the run reports it did not
      // touch. Everything present that was not there before must be a declared addition.
      for (const [rootLabel, root] of [['main', fx.mainRoot], ['worktree', fx.wtPath]]) {
        const after = listTree(path.join(root, 'kaola-workflow', spec.dir));
        const added = after.filter(p => !before[rootLabel].includes(p) && !KNOWN_ADDITIONS.has(p));
        assert(added.length === 0,
          tag + ' the ' + rootLabel + ' checkout gained undeclared entries inside ' + LIVE + ': '
            + JSON.stringify(added) + ' — archiving must not write into a directory that is not a '
            + 'project folder. If the addition is intended, declare it in KNOWN_ADDITIONS with the '
            + 'writer that makes it.\nexit: ' + r.status);
      }

      // (2) and it was not relocated into the archive under the name the caller gave.
      if (spec.forbidDest) {
        const dest = path.join(fx.mainRoot, 'kaola-workflow', 'archive', spec.given);
        assert(!fs.existsSync(dest),
          tag + ' nothing may be archived under kaola-workflow/archive/' + spec.given
            + ' — it is not a project folder; found: '
            + JSON.stringify(fs.existsSync(dest) ? fs.readdirSync(dest) : []));
      }

      // (3) NOT A SILENT SUCCESS. A run that did not archive the reserved directory must not report
      // that it did. Exiting non-zero satisfies this outright.
      const receiptArchive = (env.closure_receipt || {}).archive;
      assert(r.status !== 0 || (env.archived !== true && receiptArchive !== 'closed'),
        tag + ' finalize must not exit 0 reporting a successful archive of ' + spec.given
          + ' that it did not perform — archived=' + JSON.stringify(env.archived)
          + ', closure_receipt.archive=' + JSON.stringify(receiptArchive)
          + ', closure_invariants=' + JSON.stringify(env.closure_invariants));

      // (4) THE WORST LANE: the deletion must never reach the branch the sink merges to main.
      const afterTree = treePathsOf(fx.wtPath, 'HEAD');
      for (const rel of Object.keys(spec.foreign)) {
        assert(afterTree.includes(LIVE + rel),
          tag + ' the feature-branch HEAD no longer carries ' + LIVE + rel
            + ' — finalize committed the deletion onto the branch the sink merges to main; branch now holds: '
            + JSON.stringify(under(afterTree, LIVE)));
      }

      console.log(tag + ' reserved-directory archive: done');
    } finally { destroyFixture(fx); }
  }
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
