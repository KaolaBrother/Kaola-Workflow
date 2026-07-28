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
//   4. It FAILS only when a file's unclassified count EXCEEDS its baseline. Equal or lower
//      passes; lowering a baseline number and committing it is always allowed and is the
//      only maintenance path. A file with no baseline entry has an implicit baseline of 0 —
//      enforcement is default-on and exempt-BY-BASELINE, never an opt-in allowlist.
//   5. An unrecognised class token is RED. The vocabulary is closed: widening it means
//      amending the architecture decision that named the classes, deliberately.
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

    const allowed = Object.prototype.hasOwnProperty.call(baseline.files, file)
      ? Number(baseline.files[file]) : 0;
    if (m.unclassified > allowed) {
      failures.push(file + ': ' + m.unclassified
        + ' unclassified spawn sites exceeds the baseline of ' + allowed
        + '\n    the ratchet is tighten-only: classify the new site(s) with one of '
        + VALID_CLASSES.join(' / ')
        + ',\n    or convert them in-process. Raising the baseline is not a fix.'
        + '\n    unclassified lines in this file (last 12): '
        + m.unclassifiedLines.slice(-12).join(', '));
    }
    if (m.sites > 0 || allowed > 0) {
      rows.push({ file, sites: m.sites, classified: m.classified, unclassified: m.unclassified, allowed });
    }
  }

  // A baseline entry naming a file that no longer exists is stale, not a failure —
  // deletion is the strongest possible tightening.
  for (const file of Object.keys(baseline.files)) {
    if (!Object.prototype.hasOwnProperty.call(measured, file)) {
      console.log('spawn-ratchet: baseline entry for ' + file
        + ' is stale (file gone, or a pre-migration bare basename) — drop the row when convenient');
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
        + (slack > 0 ? '  (-' + slack + ')' : ''));
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
    + ' unclassified at or under baseline'
    + (heaviest.length ? '; heaviest: ' + heaviest.join(', ') : '') + ')');
}

if (require.main === module) main();

module.exports = {
  enumerateFile, measure, coveredFiles, suiteDirs, isSuiteFile,
  VALID_CLASSES, SYNC_APIS, BASELINE_PATH,
};
