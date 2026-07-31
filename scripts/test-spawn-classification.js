#!/usr/bin/env node
'use strict';

// test-spawn-classification.js — FORWARD-ONLY guard: a NEW test-time process spawn ships
// classified, or not at all.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// A real child process adds evidence only where the property under test lives AT the process
// boundary. The closed vocabulary names the five classes that qualify:
//
//   cli-contract     argv -> handler -> envelope -> exit code
//   concurrency      multi-process lock / atomic-write contention
//   crash            kill mid-write, restart, recover
//   environment      install / materialization / PATH probes
//   durable-handoff  one process writes a kernel record and EXITS; the next re-reads it from
//                    disk with no shared heap
//
// A site is CLASSIFIED when its own line, or the line above it, carries a line comment whose
// whole payload is the marker word, a colon, and one of those tokens.
//
// ONE ARM, deliberately. Only `measured > ceiling` is RED. Deleting spawn sites, deleting a
// whole suite, or classifying an existing site can never fail this guard. The predecessor gated
// the same numbers exactly in BOTH directions, so any deletion of test code reddened it — it
// taxed subtraction and was deleted for it, taking the forward arm and leaving the annotations
// in the tree read by nothing. This is that arm, restored without its reverse. The price is
// slack: a row keeps its number when its file shrinks below it. Slack is REPORTED in the summary
// and never gated, and `--table` re-emits the measured rows for a deliberate tightening.
//
// A stored ceiling is unavoidable: "new" needs a memory of "before", and with no memory the only
// enforceable predicate is absolute (unclassified === 0) against the 624 sites that exist today.
// So the memory is the smallest one that works — one integer per file, inline here rather than a
// separate baseline artifact — and under one arm nothing ever FORCES a row to be updated.
//
// Enforcement is default-ON: a file with no row has a ceiling of 0, so a new suite, a new edition
// tree, or a file this table forgot is guarded rather than silently exempt. Coverage is the root
// `scripts/` tree plus every `plugins/*/scripts/` edition tree — the edition walkthroughs are
// independent hand-written suites carrying ~30% of the repo's spawn sites.
//
// Usage
//   node scripts/test-spawn-classification.js
//   node scripts/test-spawn-classification.js --table   # measured rows, for lowering ceilings

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const scriptsDir = path.join(repoRoot, 'scripts');

// The synchronous child_process APIs the count is defined over — the same set the surviving
// annotations were placed against.
const SYNC_APIS = ['spawnSync', 'execFileSync', 'execSync'];

// The CLOSED class vocabulary. Adding an entry here is an architecture change.
const VALID_CLASSES = ['cli-contract', 'concurrency', 'crash', 'durable-handoff', 'environment'];

// A `//` comment whose whole payload is the marker word, a colon, and one token. Assembled from
// pieces so this file's own source carries no annotation of its own.
const CLASS_MARK = new RegExp('\\/\\/[ \\t]*spawn[-]class[ \\t]*:[ \\t]*(.*)$');

// Unclassified sites each file is allowed to carry, measured 2026-07-29. Repo-relative keys, so
// one forge's row can never exempt another's file. A file with no row has a ceiling of 0.
// A row may be LOWERED at any time; raising one is not a fix — classify the site instead.
const CEILINGS = Object.freeze({
  'plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js': 9,
  'plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js': 34,
  'plugins/kaola-workflow-gitea/scripts/test-git-fixture.js': 2,
  'plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js': 8,
  'plugins/kaola-workflow-gitea/scripts/test-gitea-run-chains.js': 4,
  'plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js': 47,
  'plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js': 72,
  'plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js': 9,
  'plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js': 36,
  'plugins/kaola-workflow-gitlab/scripts/test-git-fixture.js': 2,
  'plugins/kaola-workflow-gitlab/scripts/test-gitlab-run-chains.js': 4,
  'plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js': 52,
  'plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js': 73,
  'plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js': 29,
  'plugins/kaola-workflow/scripts/test-git-fixture.js': 2,
  'scripts/simulate-workflow-walkthrough.js': 78,
  'scripts/test-bash-block-guards.js': 2,
  'scripts/test-bundle-claim.js': 1,
  'scripts/test-bundle-finalize.js': 6,
  'scripts/test-bundle-state.js': 3,
  'scripts/test-claim-hardening.js': 64,
  'scripts/test-gap-sweep.js': 1,
  'scripts/test-generate-routing-surfaces.js': 1,
  'scripts/test-git-fixture.js': 2,
  'scripts/test-issue-probe-memo.js': 1,
  'scripts/test-ledger-compare.js': 1,
  'scripts/test-release.js': 4,
  'scripts/test-route-reachability.js': 1,
  'scripts/test-run-chains.js': 5,
  'scripts/test-shard-lib.js': 1,
  'scripts/test-sink-merge.js': 3,
  'scripts/test-validation-runner.js': 1,
});

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Is this basename a suite file the guard is defined over? */
function isSuiteFile(base) {
  if (/^test-.+\.js$/.test(base)) return true;
  return /^simulate-.*walkthrough.*\.js$/.test(base);
}

/** The root scripts/ tree plus each plugins/<edition>/scripts/ tree that exists. */
function suiteDirs() {
  const dirs = [scriptsDir];
  let entries = [];
  try {
    entries = fs.readdirSync(path.join(repoRoot, 'plugins')).sort();
  } catch (_) {
    return dirs; // a consumer checkout without the edition trees guards the root alone
  }
  for (const name of entries) {
    const dir = path.join(repoRoot, 'plugins', name, 'scripts');
    try {
      if (fs.statSync(dir).isDirectory()) dirs.push(dir);
    } catch (_) { /* plugin without a scripts/ tree */ }
  }
  return dirs;
}

/** Covered files, repo-relative and POSIX-separated. */
function coveredFiles() {
  const out = [];
  for (const dir of suiteDirs()) {
    const rel = path.relative(repoRoot, dir).split(path.sep).join('/');
    for (const base of fs.readdirSync(dir).sort()) {
      if (isSuiteFile(base)) out.push(rel + '/' + base);
    }
  }
  return out.sort();
}

/**
 * Names a synchronous child_process API is invoked under in this file. The repo's fixture style
 * renames on import (`{ execFileSync: exec665 }`), so a base-name-only scan would leave that
 * whole style unguarded.
 */
function resolveAliases(lines) {
  const aliases = new Set(SYNC_APIS);
  const renameRe = new RegExp('\\b(' + SYNC_APIS.join('|') + ')\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)', 'g');
  const bindRe = new RegExp('\\b([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*require\\(\\s*[\'"]child_process[\'"]\\s*\\)\\s*\\.\\s*('
    + SYNC_APIS.join('|') + ')\\b', 'g');
  for (const line of lines) {
    let m;
    renameRe.lastIndex = 0;
    while ((m = renameRe.exec(line)) !== null) aliases.add(m[2]);
    bindRe.lastIndex = 0;
    while ((m = bindRe.exec(line)) !== null) aliases.add(m[1]);
  }
  return aliases;
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * Enumerate one file.
 * @returns {{sites:number, classified:number, unclassified:number,
 *            unclassifiedLines:number[], badTokens:Array<{line:number, token:string}>}}
 */
function enumerateFile(text) {
  const lines = String(text).split('\n');
  const aliases = [...resolveAliases(lines)].sort((a, b) => b.length - a.length);
  const callRe = new RegExp('\\b(' + aliases.map(escapeRe).join('|') + ')\\s*\\(', 'g');

  // Annotation pass — every marker in the file is validated, adjacent to a site or not.
  const annotation = new Array(lines.length).fill(null);
  const badTokens = [];
  for (let i = 0; i < lines.length; i++) {
    const m = CLASS_MARK.exec(lines[i]);
    if (!m) continue;
    const token = m[1].trim();
    if (VALID_CLASSES.indexOf(token) === -1) badTokens.push({ line: i + 1, token });
    else annotation[i] = token;
  }

  const out = { sites: 0, classified: 0, unclassified: 0, unclassifiedLines: [], badTokens };
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    callRe.lastIndex = 0;
    let hits = 0;
    while (callRe.exec(lines[i]) !== null) hits++;
    if (!hits) continue;
    out.sites += hits;
    if (annotation[i] || (i > 0 && annotation[i - 1])) out.classified += hits;
    else {
      out.unclassified += hits;
      out.unclassifiedLines.push(i + 1);
    }
  }
  return out;
}

function measure() {
  const measured = {};
  for (const file of coveredFiles()) {
    measured[file] = enumerateFile(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
  }
  return measured;
}

/**
 * The whole verdict for one file, as a pure function of its measurement and its row. The ONLY
 * failing directions are: more unclassified sites than the ceiling, an unrecognised class token,
 * and a row that is not a non-negative integer (NaN loses every comparison silently, so an
 * uncomparable row would exempt its file while still looking like enforcement).
 * Fewer sites than the ceiling is NOT a failure and must never become one.
 * @returns {string[]} failure messages, empty when the file passes
 */
function verdictForFile(file, m, rawCeiling) {
  const failures = [];
  for (const bad of m.badTokens) {
    failures.push(file + ':' + bad.line + ': unrecognised spawn class ' + JSON.stringify(bad.token)
      + ' — the vocabulary is closed to: ' + VALID_CLASSES.join(', '));
  }
  const ceiling = rawCeiling === undefined ? 0 : Number(rawCeiling);
  if (!Number.isInteger(ceiling) || ceiling < 0) {
    failures.push(file + ': ceiling is ' + JSON.stringify(rawCeiling)
      + ', which is not a non-negative integer — every comparison against a non-number is false,'
      + ' so this row exempts the file entirely (measured: ' + m.unclassified + ').');
    return failures;
  }
  if (m.unclassified > ceiling) {
    failures.push(file + ': ' + m.unclassified + ' unclassified spawn site(s) exceeds the ceiling of '
      + ceiling + '\n    classify the new site(s) with one of ' + VALID_CLASSES.join(' / ')
      + ', or convert them in-process.\n    Raising the ceiling is not a fix.'
      + '\n    unclassified lines in this file (last 12): ' + m.unclassifiedLines.slice(-12).join(', '));
  }
  return failures;
}

// --- the guard's own mutation proof ------------------------------------------------------
// A green suite is not evidence a guard is armed, and every one of these fires on a
// hand-planted defect rather than on the tree. The last two are the load-bearing pair: the
// forward arm must fire, and the reverse arm must be ABSENT.
function selfTest() {
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  // Assembled rather than written out, so the fixtures below are not themselves spawn sites in
  // this file — a guard that trips on its own test data is a guard nobody can seed.
  const CALL = 'execFile' + 'Sync';
  const OPEN = '(';
  const site = 'const r = ' + CALL + OPEN + '"node", ["x.js"]);';
  const mark = '// ' + 'spawn-class' + ': cli-contract';
  const renamed = 'const { ' + CALL + ': run665 } = require("child_process");\n'
    + 'const r = run665' + OPEN + '"node");';

  check(enumerateFile(site).unclassified === 1, 'MUTATION: a bare spawn site must count as unclassified');
  check(enumerateFile(mark + '\n' + site).classified === 1, 'MUTATION: the line above must classify a site');
  check(enumerateFile(site + ' ' + mark).classified === 1, 'MUTATION: a trailing marker must classify its site');
  check(enumerateFile('// ' + 'spawn-class' + ': teapot\n' + site).badTokens.length === 1,
    'MUTATION: an unrecognised class token must be rejected — the vocabulary is closed');
  check(enumerateFile(renamed).unclassified === 1,
    'MUTATION: a renamed-on-import alias must still be counted');

  const one = { unclassified: 1, unclassifiedLines: [7], badTokens: [] };
  check(verdictForFile('f.js', one, undefined).length === 1,
    'MUTATION: default-ON — a file with no row has a ceiling of 0 and must FAIL on one site');
  check(verdictForFile('f.js', { unclassified: 4, unclassifiedLines: [], badTokens: [] }, 3).length === 1,
    'MUTATION: FORWARD arm — one site above the ceiling must FAIL');
  check(verdictForFile('f.js', { unclassified: 3, unclassifiedLines: [], badTokens: [] }, 3).length === 0,
    'MUTATION: a file exactly at its ceiling must PASS');
  check(verdictForFile('f.js', { unclassified: 0, unclassifiedLines: [], badTokens: [] }, 78).length === 0,
    'MUTATION: REVERSE arm must be ABSENT — deleting spawn sites can never fail this guard');
  check(verdictForFile('f.js', one, 'lots').length === 1,
    'MUTATION: an uncomparable ceiling must FAIL rather than silently exempt the file');

  if (fails.length) {
    for (const f of fails) console.error('spawn-classification: ' + f);
    console.error('spawn-classification FAILED: the guard does not fire on its own planted defects');
    process.exit(1);
  }
  return 10;
}

function main() {
  const asserts = selfTest();
  const measured = measure();

  if (process.argv.indexOf('--table') !== -1) {
    for (const [file, m] of Object.entries(measured)) {
      if (m.unclassified > 0) console.log('  ' + JSON.stringify(file) + ': ' + m.unclassified + ',');
    }
    return;
  }

  const failures = [];
  let sites = 0;
  let classified = 0;
  let unclassified = 0;
  let slack = 0;
  // NON-VACUITY. A guard whose scan finds nothing passes everything. If the walk ever stops
  // resolving the suite trees, that must be RED here rather than a silent green.
  if (Object.keys(measured).length < 40) {
    failures.push('NON-VACUITY: the scan covered only ' + Object.keys(measured).length
      + ' suite file(s) — expected the repo to carry many. The walk is looking in the wrong place,'
      + ' and a guard that scans nothing passes everything.');
  }
  for (const [file, m] of Object.entries(measured)) {
    sites += m.sites;
    classified += m.classified;
    unclassified += m.unclassified;
    const ceiling = Object.prototype.hasOwnProperty.call(CEILINGS, file) ? CEILINGS[file] : 0;
    if (Number.isInteger(ceiling) && ceiling > m.unclassified) slack += ceiling - m.unclassified;
    failures.push(...verdictForFile(file, m, Object.prototype.hasOwnProperty.call(CEILINGS, file)
      ? CEILINGS[file] : undefined));
  }
  // A row outliving its file is not a failure — deleting a suite must stay free — but it is
  // spendable slack, so it is counted where a human tightening the table will see it.
  const orphanRows = Object.keys(CEILINGS).filter(f => !Object.prototype.hasOwnProperty.call(measured, f));
  for (const f of orphanRows) slack += Number(CEILINGS[f]) || 0;

  if (failures.length) {
    for (const f of failures) console.error('spawn-classification: ' + f);
    console.error('spawn-classification FAILED (' + failures.length + ' violation(s))');
    process.exit(1);
  }

  console.log('spawn-classification passed (' + asserts + ' mutation assertions; ' + sites
    + ' spawn sites across ' + Object.keys(measured).length + ' files, ' + classified
    + ' classified, ' + unclassified + ' grandfathered; ' + slack + ' slot(s) of slack'
    + (orphanRows.length ? ', ' + orphanRows.length + ' row(s) outliving their file' : '')
    + ' — lower a ceiling with --table)');
}

if (require.main === module) main();

module.exports = { enumerateFile, verdictForFile, measure, coveredFiles, isSuiteFile, CEILINGS, VALID_CLASSES, SYNC_APIS };
