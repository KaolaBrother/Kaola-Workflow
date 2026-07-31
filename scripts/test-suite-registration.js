#!/usr/bin/env node
'use strict';

// test-suite-registration.js — a suite that is not in a chain does not run, and nothing says so.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a
// production script.
//
// This guards the FIRST oracle — "tests green under separate custody". The chains are long
// `&&`-joined single-line strings, and a merge that drops a clause from one leaves a
// package.json that parses and a chain that passes while measuring less than it claims.
// That happened three times in one campaign, twice by clean merge and once by DUPLICATE
// JSON KEYS (JSON.parse keeps the last; the shadowed copy was missing a suite).
//
//   A. REGISTRATION — every `scripts/test-*.js` is in some `scripts.test*` chain, or is in
//      EXEMPT with a reason. Default-on: a NEW suite nobody wired up is RED on arrival.
//   B. NO DUPLICATE KEYS in package.json.
//   C. NO DUPLICATE STEPS within one chain.
//   D. THE FAST GATE CARRIES EVERY SUITE the full tier does, minus the declared FULL_ONLY
//      deferrals — the fast gate is what actually runs, so a suite surviving only in the
//      tier nobody invokes is lost coverage that reads green.
//
// Usage
//   node scripts/test-suite-registration.js

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const PKG_PATH = path.join(repoRoot, 'package.json');
const SCRIPTS_DIR = path.join(repoRoot, 'scripts');

// Files matching test-*.js that are NOT suites, or are deliberately out of `npm test`.
// Each entry carries its reason; an entry that stops being true fails as stale (check E).
const EXEMPT = Object.freeze({
  'test-git-fixture.js':
    'LIBRARY, not a suite — the shared git process-boundary helper the suites import.',
  'test-shard-lib.js':
    'LIBRARY, not a suite — scenario sharding for the hand-rolled suites.',
  'test-spawn-census.js':
    'LIBRARY, not a suite — the advisory fail-open runtime spawn census the suites arm.',
  'test-opencode-edition.js':
    'ADDITIVE RUNTIME EDITION. opencode is a runtime, not a forge: deliberately not wired into '
    + 'npm test, edition-sync, install.sh, or the six routing surfaces. Run it directly.',
  'test-kimi-edition.js':
    'ADDITIVE RUNTIME EDITION. Same rule as opencode — run it directly, not via a chain.',
});

// Suites the FAST gate deliberately defers to the full tier. CLAUDE.md documents the fast gate
// as "every cheap step at full coverage, but it samples the walkthrough at a rotating 1/12 shard
// and defers a few heavyweight suites" — this is that deferral list, named, so that a suite
// silently vanishing from the fast gate is distinguishable from one deliberately held back.
const FULL_ONLY = Object.freeze([
  'test-claim-hardening.js',
  'test-release.js',
  'test-run-chains.js',
  'test-sink-merge.js',
]);

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// --- (B) duplicate JSON keys -------------------------------------------------------------
// JSON.parse keeps the LAST duplicate and reports nothing. Node has no object_pairs hook, so
// scan the `scripts` object's keys before they collapse — that is the object a merge
// realistically duplicates a key in.
function duplicateKeyPaths(raw) {
  const dups = [];
  const lines = raw.split('\n');
  const scriptsStart = lines.findIndex(l => /^\s*"scripts"\s*:\s*\{/.test(l));
  if (scriptsStart < 0) return dups;
  let depth = 0;
  const seen = new Set();
  for (let i = scriptsStart; i < lines.length; i++) {
    const line = lines[i];
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (i > scriptsStart) {
      const m = /^\s*"([^"]+)"\s*:/.exec(line);
      if (m && depth === 1) {
        if (seen.has(m[1])) dups.push('scripts.' + m[1]);
        seen.add(m[1]);
      }
    }
    if (depth <= 0 && i > scriptsStart) break;
  }
  return dups;
}

const raw = fs.readFileSync(PKG_PATH, 'utf8');
const dups = duplicateKeyPaths(raw);
assert(dups.length === 0,
  'DUPLICATE KEYS in package.json: ' + JSON.stringify(dups) + ' — JSON.parse keeps the LAST '
  + 'occurrence and npm runs it, so the earlier copy is a shadowed definition nobody sees. '
  + 'A merge produces this when two branches edit the same long chain string. Delete the '
  + 'shadowed copies, keeping the live (last) one.');

const pkg = JSON.parse(raw);
const chains = Object.entries(pkg.scripts || {}).filter(([k]) => k.startsWith('test'));
assert(chains.length > 0, 'package.json must declare at least one test chain');

// --- (A) registration --------------------------------------------------------------------
const suites = fs.readdirSync(SCRIPTS_DIR).filter(f => /^test-.*\.js$/.test(f)).sort();
// NON-VACUITY, by WITNESS rather than by count. The scan must find THIS FILE and every file the
// EXEMPT table names — a scan pointed at the wrong directory finds neither, and the count of
// suites in the repo is not a property anybody is defending. The previous form was `> 40`, which
// went red the moment the corpus legitimately shrank and would have had to be edited downward
// each time, which is exactly when a misdirected scan is hardest to notice.
assert(suites.includes(path.basename(__filename)),
  'NON-VACUITY: the test-*.js scan does not find this file itself — it is looking in the wrong '
  + 'place (found ' + suites.length + ' file(s) in ' + SCRIPTS_DIR + ')');
for (const name of Object.keys(EXEMPT)) {
  assert(suites.includes(name),
    'NON-VACUITY/STALE: the EXEMPT table names ' + name + ' but the scan does not find it — either '
    + 'the scan is misdirected or the exemption outlived the file it excused');
}

const registeredIn = new Map();
for (const f of suites) {
  const where = chains.filter(([, v]) => v.includes('scripts/' + f)).map(([k]) => k);
  if (where.length) registeredIn.set(f, where);
}

for (const f of suites) {
  const exemptReason = EXEMPT[f];
  const isRegistered = registeredIn.has(f);
  if (exemptReason) {
    // (E) an exempt entry that IS registered is stale — the exemption outlived its reason.
    assert(!isRegistered,
      'STALE EXEMPTION: ' + f + ' is listed EXEMPT ("' + exemptReason.split('.')[0]
      + '") but is registered in ' + JSON.stringify(registeredIn.get(f))
      + '. Remove it from EXEMPT — an exemption that is not true is worse than none.');
  } else {
    assert(isRegistered,
      'UNREGISTERED SUITE: scripts/' + f + ' is in no test chain, so it NEVER RUNS. Either add '
      + 'it to test:kaola-workflow:claude (and :claude:full), or add it to EXEMPT in '
      + 'scripts/test-suite-registration.js with the reason it is not a standing gate. '
      + 'Silence here is how a suite disappears without anyone noticing.');
  }
}

// (E, other direction) an EXEMPT entry naming a file that no longer exists is stale too.
for (const f of Object.keys(EXEMPT)) {
  assert(suites.includes(f),
    'STALE EXEMPTION: EXEMPT names ' + f + ' but no such file exists — delete the entry.');
}

// --- (C) no duplicate steps within one chain ---------------------------------------------
for (const [name, body] of chains) {
  for (const f of suites) {
    const n = body.split('scripts/' + f).length - 1;
    assert(n <= 1,
      'DUPLICATE STEP: ' + name + ' runs scripts/' + f + ' ' + n + ' times. A merge that '
      + 'double-inserts is silent because the chain still passes, only slower.');
  }
}

// --- (D) the fast gate must be a subset of the full tier ---------------------------------
const fast = (pkg.scripts || {})['test:kaola-workflow:claude'];
const full = (pkg.scripts || {})['test:kaola-workflow:claude:full'];
assert(typeof fast === 'string' && typeof full === 'string',
  'both test:kaola-workflow:claude and :claude:full must exist');
if (typeof fast === 'string' && typeof full === 'string') {
  const missing = suites.filter(f => fast.includes('scripts/' + f) && !full.includes('scripts/' + f));
  assert(missing.length === 0,
    'FAST-GATE NOT A SUBSET: ' + JSON.stringify(missing) + ' run in the fast gate but NOT in '
    + ':claude:full. The full tier is documented as a superset — a suite present in one and '
    + 'absent from the other means a merge dropped it from the tier nobody runs by default.');

  // THE CHECK THAT WOULD HAVE CAUGHT THE REAL INCIDENT. "Registered in at least one chain" is
  // too weak: a merge that drops a suite from the FAST GATE alone leaves it in the full tier,
  // which nobody runs by default, so coverage is lost in practice while every check stays green.
  // So the fast gate must carry every suite the full tier does, except the declared deferrals.
  const droppedFromFast = suites.filter(f =>
    full.includes('scripts/' + f) && !fast.includes('scripts/' + f) && FULL_ONLY.indexOf(f) < 0);
  assert(droppedFromFast.length === 0,
    'DROPPED FROM THE FAST GATE: ' + JSON.stringify(droppedFromFast) + ' run in :claude:full but '
    + 'NOT in the fast gate, and are not declared FULL_ONLY. The fast gate is what actually runs; '
    + 'a suite that survives only in the tier nobody invokes is lost coverage that reads green. '
    + 'Either restore it to the fast gate, or add it to FULL_ONLY with the reason it is deferred.');

  // ...and the deferral list must stay honest in both directions.
  for (const f of FULL_ONLY) {
    assert(suites.includes(f),
      'STALE FULL_ONLY: names ' + f + ' but no such suite exists — delete the entry.');
    assert(!fast.includes('scripts/' + f),
      'STALE FULL_ONLY: ' + f + ' is declared deferred from the fast gate but the fast gate runs '
      + 'it. Remove it from FULL_ONLY — a deferral that is not true hides the next real drop.');
  }
}

// --- the one guard with logic of its own must be shown to fire ---------------------------
// The registration / duplicate-step / subset checks are set differences over data read a few
// lines above; the hand-rolled duplicate-key scanner is the only thing here that could be
// silently wrong, so it is the only thing mutation-proved.
assert(duplicateKeyPaths('{\n  "scripts": {\n    "test:a": "x",\n    "test:a": "y"\n  }\n}\n').length === 1,
  'MUTATION: duplicateKeyPaths must DETECT a duplicated scripts key');
assert(duplicateKeyPaths('{\n  "scripts": {\n    "test:a": "x",\n    "test:b": "y"\n  }\n}\n').length === 0,
  'MUTATION: duplicateKeyPaths must ACCEPT distinct keys');

console.log('suite registration: ' + suites.length + ' test-*.js files, '
  + registeredIn.size + ' registered, ' + Object.keys(EXEMPT).length + ' exempt');
if (failed) {
  console.error('\nSuite registration FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('Suite registration passed (' + passed + ' assertions).');
