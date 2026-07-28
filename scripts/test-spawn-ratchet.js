#!/usr/bin/env node
'use strict';

// test-spawn-ratchet.js — tighten-only ratchet on UNCLASSIFIED test-time process spawns.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a
// production script.
//
// Why
// ---
// A real child process adds evidence only where the property under test lives AT the
// process boundary. Exactly five boundary-property classes qualify:
//
//   cli-contract     argv -> handler -> envelope -> exit code (once per subcommand, not
//                    once per scenario)
//   concurrency      multi-process lock / atomic-write contention
//   crash            kill mid-write, restart, recover
//   environment      install / materialization / PATH probes
//   durable-handoff  one process writes a kernel record and EXITS; the next re-reads it
//                    from disk with no shared heap. This is the successor axiom (A1)
//                    EXECUTED rather than asserted, and collapsing it in-process is a
//                    measured coverage regression, not a saving — see ADR 0013
//                    amendment 8 and D-523-01 H3.
//
// Everything else is function behavior plus file state, reachable in-process through the
// module.exports APIs the runtime CLIs already publish. This check does not convert
// anything; it MEASURES, and it stops the census from growing.
//
// What it does
// ------------
//   1. Enumerates every synchronous child-process call site in the suite files of the root
//      `scripts/` tree AND of every `plugins/*/scripts/` edition tree — `test-*.js` plus any
//      `simulate-*walkthrough*.js`. The edition walkthroughs are INDEPENDENT hand-written
//      suites (they are not in edition-sync's GENERATED_AGGREGATORS, so nothing regenerates
//      them from the root one); leaving them out let ~30% of the repo's spawn sites grow
//      without limit.
//   2. A site is CLASSIFIED when its own line, or the line immediately above it, carries a
//      line comment naming exactly one of the five class tokens above. The annotation form
//      is a `//` comment holding the word `spawn-class`, a colon, then one token — nothing
//      else on the comment. Put any rationale on a separate comment line.
//   3. Unclassified sites are counted per file and compared against the committed baseline
//      `scripts/spawn-ratchet-baseline.json`.
//   4. Enforcement is BIDIRECTIONAL, and only EQUAL passes. A count that EXCEEDS its row is a
//      new unclassified site. A count BELOW its row is a STALE row: the ratchet already moved
//      down and the row is carrying slack nobody granted. A row naming a file the ratchet no
//      longer covers is stale too. All three are RED, and none can be satisfied by raising a
//      number — the only maintenance path is LOWERING a row or DELETING it. A file with no
//      baseline entry has an implicit baseline of 0 — enforcement is default-on and
//      exempt-BY-BASELINE, never an opt-in allowlist, so a file legitimately at 0 needs no row
//      and produces no noise.
//
//      One direction is not a ratchet. A guard that only fires when a number goes UP is
//      silently disarmed by anything that moves a number down in the tree but not in the
//      baseline — most cheaply by a 3-way merge that keeps the side with the older, higher
//      numbers and reports no conflict. The slack it leaves behind is an exemption budget the
//      next N sites spend without ever turning anything red. This mirrors the K->0 condition
//      ratchet in scripts/test-route-reachability.js, whose stale-baseline direction enforces
//      the identical discipline for the identical reason.
//   5. An unrecognised class token is RED. The vocabulary is closed: widening it means
//      amending the architecture decision that named the classes, deliberately.
//   6. A baseline row that is not a non-negative integer is RED. `Number('lots')` is NaN and
//      every comparison against NaN is false, so an unvalidated row is a silent exemption in
//      BOTH directions — the exact shape this guard exists to refuse.
//
// A new spawn site therefore ships either classified as one of the five, or not at all.
//
// RESOLVED — the node-CLI slice is NOT converted, and `durable-handoff` is why
// -----------------------------------------------------------------------------
// The node-CLI slice — a suite spawning one of this repo's own CLIs — was where ADR 0013
// said conversion belongs and where `docs/decisions/D-523-01.md` said conversion is a
// COVERAGE REGRESSION. Two live records, same sites, opposite verdicts. Settled by ADR 0013
// amendment 8, AGAINST conversion, on measurement:
//
//   * the speed premise is refuted — bare process startup is ~30ms of a ~935ms adaptive-node
//     CLI call (~3%), measured independently in June and again 2026-07-28;
//   * the parallelization premise is refuted — a 58% call-site reduction moved the spawn
//     count NOT AT ALL (walkthrough 3,755 before and after; test-adaptive-node 3,986 before
//     and after; wall clock 437s -> 436s). Conversion removes call sites, not processes;
//   * the coverage cost is real — D-523-01's H3, CONFIRMED.
//
// The four-class vocabulary simply had no home for "writes and exits, then re-reads". That
// was an omission, not a licence to override a measured decision, so the fifth class names
// it. Annotate such a site `durable-handoff` rather than converting it. D-523-01 stands.
//
// Usage
//   node scripts/test-spawn-ratchet.js
//   node scripts/test-spawn-ratchet.js --json   # measured counts, for lowering the baseline

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const scriptsDir = path.join(repoRoot, 'scripts');
const BASELINE_PATH = path.join(scriptsDir, 'spawn-ratchet-baseline.json');

// The synchronous child_process APIs the census is defined over.
const SYNC_APIS = ['spawnSync', 'execFileSync', 'execSync'];

// The CLOSED class vocabulary. Adding an entry here is an architecture change.
const VALID_CLASSES = ['cli-contract', 'concurrency', 'crash', 'durable-handoff', 'environment'];

// A `//` comment whose whole payload is the marker word, a colon, and one token.
// (Written with character classes so this file's own source carries no annotation.)
const CLASS_MARK = new RegExp('\\/\\/[ \\t]*spawn[-]class[ \\t]*:[ \\t]*(.*)$');

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Is this basename a suite file the ratchet is defined over? */
function isSuiteFile(base) {
  if (/^test-.+\.js$/.test(base)) return true;
  return /^simulate-.*walkthrough.*\.js$/.test(base);
}

// Every suite directory in the repo: the root `scripts/` tree plus each edition tree under
// plugins/<edition>/scripts/. Returned repo-relative so the baseline keys one row per real
// file — a basename-keyed baseline would let one forge's row silently exempt another's file.
function suiteDirs() {
  const dirs = [scriptsDir];
  const pluginsDir = path.join(repoRoot, 'plugins');
  let entries = [];
  try {
    entries = fs.readdirSync(pluginsDir).sort();
  } catch (_) {
    return dirs; // a consumer checkout without the edition trees ratchets the root alone
  }
  for (const name of entries) {
    const dir = path.join(pluginsDir, name, 'scripts');
    try {
      if (fs.statSync(dir).isDirectory()) dirs.push(dir);
    } catch (_) { /* plugin without a scripts/ tree */ }
  }
  return dirs;
}

/** Files the ratchet is defined over, repo-relative and POSIX-separated. */
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
 * Resolve the names a synchronous child_process API is invoked under in this file.
 * The repo's established fixture style renames on import (`{ execFileSync: exec665 }`),
 * so a base-name-only scan would leave that whole style unratcheted.
 */
function resolveAliases(lines) {
  const aliases = new Set(SYNC_APIS);
  const renameRe = new RegExp(
    '\\b(' + SYNC_APIS.join('|') + ')\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)', 'g');
  const bindRe = new RegExp(
    '\\b([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*require\\(\\s*[\'"]child_process[\'"]\\s*\\)\\s*\\.\\s*('
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
 *            byClass:object, unclassifiedLines:number[], badTokens:Array}}
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

  // Site pass.
  const out = {
    sites: 0, classified: 0, unclassified: 0,
    byClass: {}, unclassifiedLines: [], badTokens,
  };
  for (const c of VALID_CLASSES) out.byClass[c] = 0;
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    callRe.lastIndex = 0;
    let hits = 0;
    while (callRe.exec(lines[i]) !== null) hits++;
    if (!hits) continue;
    out.sites += hits;
    const cls = annotation[i] || (i > 0 ? annotation[i - 1] : null);
    if (cls) {
      out.classified += hits;
      out.byClass[cls] += hits;
    } else {
      out.unclassified += hits;
      out.unclassifiedLines.push(i + 1);
    }
  }
  return out;
}

function measure() {
  const measured = {};
  for (const file of coveredFiles()) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    measured[file] = enumerateFile(text);
  }
  return measured;
}

function loadBaseline() {
  let raw;
  try {
    raw = fs.readFileSync(BASELINE_PATH, 'utf8');
  } catch (_) {
    return { error: 'baseline_missing' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { error: 'baseline_unparseable', detail: String(err && err.message) };
  }
  if (!parsed || typeof parsed.files !== 'object' || parsed.files === null) {
    return { error: 'baseline_malformed', detail: 'expected a top-level "files" object' };
  }
  return { files: parsed.files };
}

function main() {
  const argv = process.argv.slice(2);
  const measured = measure();

  if (argv.indexOf('--json') !== -1) {
    const files = {};
    for (const [file, m] of Object.entries(measured)) {
      if (m.unclassified > 0) files[file] = m.unclassified;
    }
    console.log(JSON.stringify({ files }, null, 2));
    return;
  }

  const baseline = loadBaseline();
  if (baseline.error) {
    console.error('spawn-ratchet: FAILED — ' + baseline.error
      + (baseline.detail ? ' (' + baseline.detail + ')' : '')
      + '\n  expected a committed baseline at scripts/spawn-ratchet-baseline.json');
    process.exitCode = 1;
    return;
  }

  const failures = [];
  let totalSites = 0;
  let totalUnclassified = 0;
  let totalClassified = 0;
  const rows = [];

  for (const [file, m] of Object.entries(measured)) {
    totalSites += m.sites;
    totalUnclassified += m.unclassified;
    totalClassified += m.classified;

    for (const bad of m.badTokens) {
      failures.push(file + ':' + bad.line
        + ': unrecognised spawn class ' + JSON.stringify(bad.token)
        + ' — the vocabulary is closed to: ' + VALID_CLASSES.join(', '));
    }

    const hasRow = Object.prototype.hasOwnProperty.call(baseline.files, file);
    const rawRow = hasRow ? baseline.files[file] : 0;
    const allowed = Number(rawRow);

    // An uncomparable row fails BEFORE either direction is evaluated. NaN loses every
    // comparison silently, so a row that is not a plain non-negative integer would exempt its
    // file from the ratchet entirely while still looking like enforcement.
    if (!Number.isInteger(allowed) || allowed < 0) {
      failures.push(file + ': baseline row is ' + JSON.stringify(rawRow)
        + ', which is not a non-negative integer'
        + '\n    every comparison against a non-number is false, so this row exempts the file in BOTH'
        + '\n    directions. Fix it in scripts/spawn-ratchet-baseline.json (measured: '
        + m.unclassified + ').');
      rows.push({ file, sites: m.sites, classified: m.classified, unclassified: m.unclassified, allowed: NaN });
      continue;
    }

    if (m.unclassified > allowed) {
      failures.push(file + ': ' + m.unclassified
        + ' unclassified spawn sites exceeds the baseline of ' + allowed
        + '\n    the ratchet is tighten-only: classify the new site(s) with one of '
        + VALID_CLASSES.join(' / ')
        + ',\n    or convert them in-process. Raising the baseline is not a fix.'
        + '\n    unclassified lines in this file (last 12): '
        + m.unclassifiedLines.slice(-12).join(', '));
    } else if (hasRow && m.unclassified < allowed) {
      // The other direction. Slack a row carries but the file does not need is an exemption
      // budget nobody granted — and the cheapest way to acquire one is a 3-way merge that
      // keeps the side with the older, higher number and reports no conflict.
      failures.push('stale-baseline: ' + file + ' measures ' + m.unclassified
        + ' unclassified spawn site(s) but its baseline row allows ' + allowed
        + '\n    the ratchet already moved DOWN and the row did not follow it. LOWER the row to '
        + m.unclassified
        + (m.unclassified === 0
          ? ' — or DELETE it, since a\n    row of 0 is the implicit default for every covered file'
          : '')
        + ' in scripts/spawn-ratchet-baseline.json.'
        + '\n    Enforcement is bidirectional and only EQUAL passes: ' + (allowed - m.unclassified)
        + ' slot(s) of slack is ' + (allowed - m.unclassified)
        + ' unclassified\n    site(s) that could be added back with the gate still green.');
    }
    if (m.sites > 0 || allowed > 0 || hasRow) {
      rows.push({ file, sites: m.sites, classified: m.classified, unclassified: m.unclassified, allowed });
    }
  }

  // A baseline entry naming a file the ratchet no longer covers is the same defect in its
  // strongest form: an exemption with nothing to exempt, which silently re-attaches itself to
  // any future file that lands on that path. Deletion is the only fix, so this is RED rather
  // than a console note nobody reads.
  for (const file of Object.keys(baseline.files)) {
    if (!Object.prototype.hasOwnProperty.call(measured, file)) {
      failures.push('stale-baseline: ' + file + ' carries a baseline row of '
        + JSON.stringify(baseline.files[file])
        + ' but the ratchet no longer covers that file'
        + '\n    (deleted, renamed, or a pre-migration bare basename). DELETE the row from'
        + '\n    scripts/spawn-ratchet-baseline.json — the baseline may only shrink, and a row that'
        + '\n    outlives its file pre-grants an exemption to whatever lands on that path next.');
    }
  }

  // The per-file table is detail, not a verdict: print it when something is wrong (so the
  // failure is self-diagnosing) or on request, never as routine chain noise.
  if (failures.length || argv.indexOf('--verbose') !== -1) {
    for (const r of rows) {
      const slack = r.allowed - r.unclassified;
      console.log('  ' + r.file.padEnd(58)
        + ' sites=' + String(r.sites).padStart(4)
        + '  classified=' + String(r.classified).padStart(4)
        + '  unclassified=' + String(r.unclassified).padStart(4)
        + '  baseline=' + String(r.allowed).padStart(4)
        + (slack > 0 ? '  (STALE: row carries ' + slack + ' slot(s) of unused slack)' : '')
        + (slack < 0 ? '  (EXCEEDS by ' + (-slack) + ')' : ''));
    }
  }

  if (failures.length) {
    for (const f of failures) console.error('spawn-ratchet: ' + f);
    console.error('spawn-ratchet FAILED (' + failures.length + ' violations)');
    process.exitCode = 1;
    return;
  }

  const heaviest = rows.slice().sort((a, b) => b.unclassified - a.unclassified).slice(0, 3)
    .filter(r => r.unclassified > 0)
    .map(r => r.file + ' ' + r.unclassified);
  console.log('spawn-ratchet passed (' + totalSites + ' spawn sites across ' + rows.length
    + ' files; ' + totalClassified + ' classified, ' + totalUnclassified
    + ' unclassified, every baseline row exact in both directions'
    + (heaviest.length ? '; heaviest: ' + heaviest.join(', ') : '') + ')');
}

if (require.main === module) main();

module.exports = {
  enumerateFile, measure, coveredFiles, suiteDirs, isSuiteFile,
  VALID_CLASSES, SYNC_APIS, BASELINE_PATH,
};
