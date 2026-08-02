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
//     enumeration is the honest mechanism for it.
//
// Non-vacuity is mechanical, never a claim in a comment:
//   * every set-equality in B is preceded by a shape guard, so an extractor that silently
//     matched nothing cannot pass as `[] === []`;
//   * the docs row and the docs count sentence must be FOUND, not merely agree once found;
//   * A's healthy control asserts the very finding the fault leg asserts is ABSENT, so a fixture
//     that failed for its own reasons cannot green the fault leg.
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
function buildFixture(ed) {
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
  G.commitAll(mainRoot, 'init');
  fs.mkdirSync(kwRoot, { recursive: true });
  G.exec(mainRoot, ['worktree', 'add', '-b', 'workflow/' + PROJECT, '--', wtPath, 'main'],
    { encoding: 'utf8', stdio: 'pipe' });

  // The live folder is COMMITTED on the feature branch: staging it away is exactly the work the
  // archive step does, so a fixture that left it untracked would make the failure unobservable.
  writeState(wtPath);
  seed(wtPath);
  G.commitPaths(wtPath, ['kaola-workflow/'], 'chore: finalize ' + PROJECT);

  writeState(mainRoot);
  seed(mainRoot);
  G.commitPaths(mainRoot, ['kaola-workflow/'], 'mirror: live folder on main');

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

for (const ed of EDITIONS) {
  // ---- healthy control: the finding is CAUSED by the fault, not carried by the fixture -------
  let fx = buildFixture(ed);
  try {
    const ok = runFinalize(ed, fx, false);
    assert(ok.status === 0,
      'behavioural[' + ed.label + '] healthy finalize must exit 0, got ' + ok.status
        + '\nstdout: ' + ok.stdout + '\nstderr: ' + ok.stderr);
    assert(ok.tx && ok.tx.archive_stage === 'staged',
      'behavioural[' + ed.label + '] healthy finalize must record archive_stage=staged, got: '
        + JSON.stringify(ok.tx));
    assert(!ok.findings.includes('archive_stage_failed'),
      'behavioural[' + ed.label + '] healthy finalize must raise NO archive_stage_failed — a '
        + 'fixture that always fails would green the fault leg for the wrong reason; findings: '
        + JSON.stringify(ok.findings));
    assert(!ok.findings.includes('archive_unstage_failed'),
      'behavioural[' + ed.label + '] healthy finalize must raise no archive_unstage_failed either; '
        + 'findings: ' + JSON.stringify(ok.findings));
  } finally { destroyFixture(fx); }

  // ---- the fault: the archive staging genuinely cannot write the index ------------------------
  fx = buildFixture(ed);
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
  } finally { destroyFixture(fx); }

  console.log('behavioural[' + ed.label + '] archive-staging fault names the live run folder: done');
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

console.log('static: finding-type registries and their docs/api.md statements: done');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
