#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// measure-site-execution.js — "is this site executed AT ALL?"
//
// The existing instruments answer other questions. The refusal route sweep's TIER A proves a
// route RESOLVES; its TIER B (provoke -> follow -> arrive green) is registered for zero of 63
// cells. The condition census counts emission SITES statically. None of them observes whether a
// site ever runs, and a site that never runs under any driver is a deletion nomination that
// nobody has to argue about.
//
// Method: wrap the condition literal at every emission site in a probe that logs and returns the
// token unchanged (`reason: __KW_SITE_PROBE(...)`), run a driver, count hits. Every emission shape
// captures a literal in EXPRESSION position, which is why one substitution covers all of them.
//
// THREE PROPERTIES, all learned from instruments in this campaign that lied:
//   1. COMPLETENESS IS ASSERTED, NEVER ASSUMED. instrumented + skipped == static sites, checked.
//      A prior recorder truncated at ~90 of 189 call sites inside a `catch (_) {}` and produced a
//      confident zero for a file holding 81 real assertions.
//   2. WHAT IT COULD NOT REACH IS OUTPUT, NOT OMISSION. Sites that do not match a substitutable
//      shape are listed with a reason. An instrument that silently drops its hard cases is the
//      same failure wearing a different hat.
//   3. A POSITIVE CONTROL OR THE RUN IS VOID. If no site anywhere is hot, the instrument is broken
//      and every zero is meaningless. That is an error, not a result.
//
// COLD IS A NOMINATION, NOT A VERDICT. Cold under THIS driver means no witness. The driver is a
// sample of the reachable space, not the space. Deletion still needs its own argument.
//
// The emission shapes are READ FROM `test-refusal-route-sweep.js`, never copied. Two measurements
// of the same population may not disagree, and a third hand-kept copy is how they start to.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_IX = process.argv.indexOf('--repo');
const REPO = REPO_IX >= 0 ? path.resolve(process.argv[REPO_IX + 1]) : path.resolve(__dirname, '..');
const SWEEP_REL = 'scripts/test-refusal-route-sweep.js';
const PROBE_FN = '__KW_SITE_PROBE';

function die(msg) { console.error('measure-site-execution: ' + msg); process.exit(2); }

// ---- shapes, derived from the canonical source -----------------------------
function extractSweepShapes(src) {
  const m = src.match(/\nconst EMISSION_SHAPES = \[\n([\s\S]*?)\n\];\n/);
  if (!m) return null;
  const out = [];
  for (const line of m[1].split('\n')) {
    const lm = line.match(/^\s*\/(.*)\/([gimsuy]*),\s*$/);
    if (!lm) return null;
    out.push(new RegExp(lm[1], lm[2].includes('g') ? lm[2] : lm[2] + 'g'));
  }
  return out.length ? out : null;
}

const SWEEP_SRC = fs.readFileSync(path.join(REPO, SWEEP_REL), 'utf8');
const SHAPES = extractSweepShapes(SWEEP_SRC);
if (!SHAPES) {
  die('could not locate `const EMISSION_SHAPES = [...]` in ' + SWEEP_REL + ' — re-point this '
    + 'extractor rather than copying the shapes here, or the two censuses fork.');
}

// The census is SEVEN shapes, not five: a sixth/seventh come from a per-file DERIVED shape over
// local refusal constructors (`const reject = reason => ({ ok:false, reason })`). Scanning without
// it silently under-counts — measured, 726 distinct tokens instead of the sweep's 747. These are
// LIFTED from the canonical source and evaluated, never re-typed, for the same no-fork reason.
function liftFromSweep() {
  const keys = SWEEP_SRC.match(/\nconst REFUSAL_CONSTRUCTOR_KEYS = '[^']*';\n/);
  const derive = SWEEP_SRC.match(/\nfunction deriveRefusalConstructors\([\s\S]*?\n\}\n/);
  const shape = SWEEP_SRC.match(/\nfunction refusalConstructorShape\([\s\S]*?\n\}\n/);
  if (!keys || !derive || !shape) {
    die('could not lift REFUSAL_CONSTRUCTOR_KEYS / deriveRefusalConstructors / '
      + 'refusalConstructorShape from ' + SWEEP_REL + ' — they were renamed or inlined. Re-point '
      + 'this extractor; do NOT copy them here, or the censuses fork.');
  }
  return new Function(keys[0] + derive[0] + shape[0]
    + '\nreturn { deriveRefusalConstructors, refusalConstructorShape };')();
}
const { deriveRefusalConstructors, refusalConstructorShape } = liftFromSweep();

// ---- the static population -------------------------------------------------
// Same file set the condition census uses, derived by pattern rather than listed.
function censusFiles() {
  return fs.readdirSync(path.join(REPO, 'scripts'))
    .filter(f => /^kaola-workflow-.*\.js$/.test(f))
    .map(f => 'scripts/' + f)
    .sort();
}

// A site is (file, line, column, token). Column is what makes the substitution exact when one
// line carries two literals — the census dedupes to (file,line,token) and would lose the second.
// Index of the closing quote of the single-quoted literal opening at `col`, or -1 if the line
// does not close it. Escapes are honoured so `'it\'s'` is one literal, not two.
function closingQuote(line, col) {
  for (let j = col + 1; j < line.length; j++) {
    if (line[j] === '\\') { j++; continue; }
    if (line[j] === "'") return j;
  }
  return -1;
}

const skippedScan = [];

function scanSites(files) {
  const sites = [];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(REPO, rel), 'utf8');
    const lines = content.split('\n');
    const shapes = SHAPES.slice();
    const derived = refusalConstructorShape(deriveRefusalConstructors(content));
    if (derived) shapes.push(derived);
    for (let i = 0; i < lines.length; i++) {
      const seen = new Set();
      for (const re of shapes) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(lines[i])) !== null) {
          const token = m[1];
          // ---------------------------------------------------------------------------------
          // THE UNDERSCORE FILTER IS DELIBERATELY ABSENT HERE. DO NOT RE-ADD IT.
          //
          // The condition census (`scanConditionEmissions`, test-route-reachability.js) drops any
          // literal without an underscore. That is defensible THERE: it is a shrink-only ratchet
          // over compound reason tokens. It is wrong HERE, because this scan is a POPULATION, and
          // filtering the population by spelling makes the completeness assertion below read
          // "instrumented == the underscore-containing sites" — vacuous, and vacuous in exactly
          // the region a refusal probe most needs: `halt`, `consent`, `integrity`, `missing`,
          // `ambiguous`, `unparseable`, `inconclusive`, `offline`, `failed` are all single words.
          //
          // The defect lives at the SEAM, not in either component: the census is correct as a
          // ratchet and wrong as a denominator, and this is its first consumer that needs it as
          // one. The cross-check below therefore compares only the underscore-bearing SUBSET
          // against the census's independent figure, and instruments everything.
          //
          // MEASURED COST OF THE FILTER, so this is not an argument from principle:
          //   sites   1,413 -> 1,526      distinct tokens   747 -> 786
          // 39 tokens in scripts/ alone were invisible, and they are the refusal vocabulary:
          //   absent acquired active adopt ambiguous blocked closed complete cycle done drift
          //   empty exists fail failed fresh green halt inconclusive indeterminate memo merged
          //   mirrored missing none owned pass refused signal sinked skipped stale timeout
          //   unmeasurable unparseable unsatisfied updated yellow
          // `halt`, `consent`-adjacent states, `ambiguous`, `inconclusive`, `unparseable` — the
          // conditions a refusal probe most needs are disproportionately SINGLE WORDS.
          //
          // HOW THIS WAS FOUND, because the failure mode is the point: the filter was copied
          // verbatim into THIS scanner from the census, and a shakeout run measured through it
          // was reported as clean and cross-checked green. The bias was already in a result
          // before anyone could have known. A green cross-check does not tell you your
          // population is right; it tells you two instruments share an assumption.
          // ---------------------------------------------------------------------------------
          // Wrap the WHOLE string literal, not the token. Shape 5 matches `throw new Error('x_y:`
          // where the source literal is `'x_y:' + arg` — there is no `'x_y'` to substitute, and
          // assuming there was silently dropped those sites (measured: 744 of 747).
          const rel0 = m[0].indexOf("'" + token);
          if (rel0 < 0) continue;
          const col = m.index + rel0;
          const end = closingQuote(lines[i], col);
          if (end < 0) {
            skippedScan.push({ file: rel, line: i + 1, col, token,
              why: 'string literal is not closed on its own line — a multi-line or template form '
                + 'this substitution cannot wrap safely' });
            continue;
          }
          const key = col + ':' + token;
          if (seen.has(key)) continue;
          seen.add(key);
          sites.push({ file: rel, line: i + 1, col, token, lit: lines[i].slice(col, end + 1) });
        }
      }
    }
  }
  return sites;
}

// ---- instrumentation -------------------------------------------------------
// Right-to-left within a line so earlier columns keep their offsets.
function instrument(files, sites, destRoot) {
  const bySite = new Map();
  for (const s of sites) {
    const k = s.file + '\u0000' + s.line;
    if (!bySite.has(k)) bySite.set(k, []);
    bySite.get(k).push(s);
  }
  const done = [];
  const skipped = [];
  for (const rel of files) {
    const abs = path.join(REPO, rel);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const here = (bySite.get(rel + '\u0000' + (i + 1)) || []).slice().sort((a, b) => b.col - a.col);
      for (const s of here) {
        const lit = s.lit;
        if (lines[i].slice(s.col, s.col + lit.length) !== lit) {
          skipped.push(Object.assign({}, s, {
            why: 'literal not found at its scanned column — the line was already rewritten by an '
              + 'earlier substitution on this same line, or the shape matched inside a larger literal' }));
          continue;
        }
        const id = s.file + ':' + s.line + ':' + s.token;
        lines[i] = lines[i].slice(0, s.col)
          + PROBE_FN + '(' + lit + ',' + JSON.stringify(id) + ')'
          + lines[i].slice(s.col + lit.length);
        done.push(Object.assign({}, s, { id }));
      }
    }
    // Declaration, so it hoists above every use regardless of where the sites sit. No try/catch:
    // an instrument that throws must kill the run, never report a false zero.
    const preamble = 'function ' + PROBE_FN + '(t, s) {\n'
      + '  require("fs").appendFileSync(process.env.KW_SITE_LOG, s + "\\n");\n'
      + '  return t;\n'
      + '}\n';
    const src = lines.join('\n');
    // After 'use strict' if present, so the directive stays the first statement.
    const out = src.startsWith("#!")
      ? src.replace(/\n/, '\n' + preamble)
      : (/^'use strict';/.test(src) ? src.replace(/^'use strict';\n/, "'use strict';\n" + preamble)
        : preamble + src);
    const dest = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
  }
  return { done, skipped };
}

// ---- main ------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const rootIx = argv.indexOf('--root');
  if (rootIx < 0) die('--root <dir> is required (a mirrored tree to instrument; it is MUTATED).');
  const destRoot = path.resolve(argv[rootIx + 1]);
  const drivers = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--driver') drivers.push(argv[i + 1]);
  if (!drivers.length) die('at least one --driver <script-rel-path> is required.');
  const logPath = path.join(destRoot, 'kw-site-hits.log');

  if (!fs.existsSync(destRoot)) die('--root ' + destRoot + ' does not exist; mirror the tree first '
    + '(git archive HEAD | tar -x -C <dir>) so the driver has its fixtures.');

  const files = censusFiles();
  const sites = scanSites(files);

  // CROSS-CHECK against a figure a DIFFERENT instrument prints independently. #853 shipped a
  // confident zero from a recorder that had silently captured half its input; the obligated set
  // there was cross-checked against an independent 165 and that is the only reason it was
  // trustworthy. An instrument that cannot be checked against something it did not compute is
  // asking to be believed.
  // Scoped to the underscore-bearing SUBSET, because that is the population the census measures.
  // Comparing the full set would fail by construction and tempt someone to "fix" it by re-adding
  // the filter to the scan — which is the bias this instrument exists without.
  const mine = new Set(sites.map(s => s.token).filter(t => t.indexOf('_') >= 0)).size;
  const sweepOut = require('child_process').spawnSync(
    process.execPath, [path.join(REPO, SWEEP_REL)], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = (sweepOut.stdout || '').match(/distinct_condition_values=(\d+)/);
  if (!m) {
    die('could not read distinct_condition_values from the refusal sweep (exit '
      + sweepOut.status + (sweepOut.signal ? ', signal ' + sweepOut.signal : '')
      + '). Without an independent figure this measurement has no cross-check; refusing to report.');
  }
  if (Number(m[1]) !== mine) {
    die('POPULATION MISMATCH: this scan sees ' + mine + ' distinct condition values, the refusal '
      + 'sweep reports ' + m[1] + '. Two measurements of the same population may not disagree — '
      + 'reconcile the shapes before trusting any hot/cold number below.');
  }

  const inst = instrument(files, sites, destRoot);
  const done = inst.done;
  // Scan-time drops (unclosable literal) are skips too — accounting for them only at substitution
  // time would let the population quietly shrink before the completeness check ever saw it.
  const skipped = inst.skipped.concat(skippedScan);

  // PROPERTY 1 — completeness, asserted.
  if (done.length + inst.skipped.length !== sites.length) {
    die('COMPLETENESS FAILED: scanned ' + sites.length + ' sites but accounted for '
      + (done.length + inst.skipped.length) + ' (instrumented ' + done.length + ' + skipped '
      + inst.skipped.length + '). The measurement is void.');
  }

  fs.writeFileSync(logPath, '');
  const env = Object.assign({}, process.env, { KW_SITE_LOG: logPath });
  const driverStatus = [];
  for (const d of drivers) {
    let code = 0;
    let killed = null;
    // NO catch-all: a non-zero exit is expected (drivers may fail under instrumentation), but the
    // exit code is RECORDED and reported. A killed driver (SIGTERM/SIGKILL) is evidence of
    // nothing, and is reported as such rather than folded into the result.
    // A driver may carry its own flags ("scripts/test-parallel.js --self-test"); dropping them
    // would run a different program than the chain does.
    const r = require('child_process').spawnSync(process.execPath, d.split(/\s+/), {
      cwd: destRoot, env, encoding: 'utf8', maxBuffer: 1 << 28,
    });
    code = r.status;
    if (r.signal) killed = r.signal;
    driverStatus.push({ driver: d, exit: code, signal: killed });
  }

  const hits = new Map();
  for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
    if (!line) continue;
    hits.set(line, (hits.get(line) || 0) + 1);
  }

  // PROPERTY 3 — positive control.
  if (hits.size === 0) {
    die('NO SITE ANYWHERE WAS HIT. The instrument is broken or no driver ran; every zero below '
      + 'would be meaningless. This is an error, not a result.');
  }

  const hot = done.filter(s => hits.has(s.id));
  const cold = done.filter(s => !hits.has(s.id));

  const report = {
    static_sites: sites.length,
    instrumented: done.length,
    skipped: skipped.length,
    files: files.length,
    drivers: driverStatus,
    hot_sites: hot.length,
    cold_sites: cold.length,
    distinct_tokens_static: new Set(sites.map(s => s.token)).size,
    distinct_tokens_hot: new Set(hot.map(s => s.token)).size,
    // PROPERTY 2 — what it could not reach, as output.
    could_not_instrument: skipped,
    cold: cold.map(s => ({ file: s.file, line: s.line, token: s.token })),
  };
  const outPath = path.join(destRoot, 'kw-site-execution.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('SITE EXECUTION — static=' + report.static_sites
    + '  instrumented=' + report.instrumented
    + '  could_not_instrument=' + report.skipped
    + '  HOT=' + report.hot_sites + '  COLD=' + report.cold_sites);
  console.log('  distinct tokens: static=' + report.distinct_tokens_static
    + '  ever-executed=' + report.distinct_tokens_hot
    + '   [underscore-bearing subset=' + mine + ', cross-checked against the census]');

  // THE DENOMINATOR AND THE UNREACHED SET TRAVEL WITH THE RESULT, ALWAYS. A bare list of cold
  // sites without the population it was measured against is the shape that has misled this
  // campaign repeatedly, so neither is a footnote and neither can be omitted by a quiet run.
  const killed = driverStatus.filter(d => d.signal);
  const nonZero = driverStatus.filter(d => !d.signal && d.exit !== 0);
  console.log('  DRIVERS: ' + driverStatus.length + ' run, ' + nonZero.length
    + ' non-zero exit, ' + killed.length + ' KILLED');
  for (const d of killed) {
    console.log('    !! KILLED ' + d.driver + ' signal=' + d.signal
      + ' — evidence of NOTHING in either direction; this readout is INCOMPLETE until it is re-run');
  }
  for (const d of nonZero) console.log('    non-zero: ' + d.driver + ' exit=' + d.exit);
  console.log('  COULD NOT INSTRUMENT: ' + skipped.length
    + (skipped.length ? ' — listed in the report; these sites are NOT part of the cold set and'
      + ' were never observed either way' : ' (every scanned site carries a probe)'));
  for (const s of skipped.slice(0, 20)) {
    console.log('    - ' + s.file + ':' + s.line + ' ' + s.token + ' — ' + s.why);
  }
  if (skipped.length > 20) console.log('    ... ' + (skipped.length - 20) + ' more in the report');
  console.log('  report: ' + outPath);
  console.log('  COLD IS A NOMINATION, NOT A VERDICT — cold under THIS driver set means no witness,'
    + ' not dead. The drivers are a sample of the reachable space, not the space.');
}

main();
