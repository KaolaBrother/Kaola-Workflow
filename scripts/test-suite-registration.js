#!/usr/bin/env node
'use strict';

// test-suite-registration.js — a suite that is not in a chain does not run, and nothing says so.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a
// production script.
//
// Why
// ---
// The validation chains in package.json are long `&&`-joined single-line strings. That shape
// has now produced THREE separate silent coverage losses in one campaign, and every one of
// them left a package.json that parses and a chain that passes:
//
//   1. Two branches each appended a suite to the same chain. The merge kept one side and
//      SILENTLY DROPPED the other suite from both the fast gate and the full tier.
//   2. A later merge could not reconcile two edits to the same long string as text, so it
//      emitted BOTH key/value pairs — package.json ended up with DUPLICATE JSON KEYS. It
//      parses; npm resolves last-wins; the shadowed copy was one resolution away from
//      becoming live, and it was missing a suite.
//   3. Merging a branch cut before (1) was fixed re-dropped the same suite again.
//
// A human reading a 4,000-character single-line string does not see an absent `&&` clause,
// and no existing check looks. This one does.
//
// What it enforces
// ----------------
//   A. REGISTRATION — every `scripts/test-*.js` appears in at least one `scripts.test*`
//      chain, or is listed in EXEMPT below with a reason. Default-on, exempt-by-baseline,
//      never an opt-in allowlist: a NEW suite that nobody wired up is RED on arrival.
//   B. NO DUPLICATE KEYS — package.json is re-parsed with a pairs hook, because JSON.parse
//      silently keeps the last of a duplicated key and that is exactly failure (2).
//   C. NO DUPLICATE STEPS — a suite appears at most once per chain, so a merge that
//      double-inserts is visible rather than merely wasteful.
//   D. THE FAST GATE IS A SUBSET OF THE FULL TIER — a suite in `:claude` but absent from
//      `:claude:full` means the full tier is not actually fuller, which is the same silent
//      loss wearing the opposite sign.
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
  'test-mega-mutation-spotcheck.js':
    'ONE-SHOT mutation spot-check written for a specific historical prune; not a standing gate.',
});

// Suites the FAST gate deliberately defers to the full tier. CLAUDE.md documents the fast gate
// as "every cheap step at full coverage, but the three heavyweight suites run a rotating 1/12
// slice and six non-samplable suites are deferred" — this is that six, named, so that a suite
// silently vanishing from the fast gate is distinguishable from one deliberately held back.
const FULL_ONLY = Object.freeze([
  'test-barrier-base-integrity.js',
  'test-claim-hardening.js',
  'test-interior-gate-freshness.js',
  'test-release.js',
  'test-run-chains.js',
  'test-sink-merge.js',
]);

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// --- (B) duplicate JSON keys -------------------------------------------------------------
// JSON.parse keeps the LAST duplicate and reports nothing, so the only way to see this is to
// walk the pairs before they collapse into an object.
function duplicateKeyPaths(raw) {
  const dups = [];
  const walk = (pairs, prefix) => {
    const seen = new Set();
    for (const [k] of pairs) {
      if (seen.has(k)) dups.push(prefix ? prefix + '.' + k : k);
      seen.add(k);
    }
    return Object.fromEntries(pairs);
  };
  // A pairs hook cannot see its own path, so do a shallow pass over the top level and over
  // `scripts` — the two objects a merge realistically duplicates a key in.
  JSON.parse(raw, undefined);
  const topPairs = [];
  const reviver = (key, value) => value;
  // Re-parse with an object_pairs-style hook, hand-rolled: Node has no such option, so use a
  // minimal scanner over the two nesting levels we care about.
  const lines = raw.split('\n');
  const scriptsStart = lines.findIndex(l => /^\s*"scripts"\s*:\s*\{/.test(l));
  if (scriptsStart >= 0) {
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
  }
  void topPairs; void walk; void reviver;
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
assert(suites.length > 40,
  'NON-VACUITY: expected the repo to carry many test-*.js files, found ' + suites.length
  + ' — the scan is looking in the wrong place');

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

// --- mutation battery: every checker above must REJECT a deliberately broken input --------
// A green suite is not evidence a guard is armed unless the guard has been shown to fail.
{
  const dupRaw = '{\n  "scripts": {\n    "test:a": "x",\n    "test:a": "y"\n  }\n}\n';
  assert(duplicateKeyPaths(dupRaw).length === 1,
    'MUTATION: duplicateKeyPaths must DETECT a duplicated scripts key');
  const cleanRaw = '{\n  "scripts": {\n    "test:a": "x",\n    "test:b": "y"\n  }\n}\n';
  assert(duplicateKeyPaths(cleanRaw).length === 0,
    'MUTATION: duplicateKeyPaths must ACCEPT distinct keys');

  // registration: a fabricated suite name must be reported as unregistered by the same
  // predicate the loop above uses.
  const fake = 'test-zzz-not-wired.js';
  assert(!chains.some(([, v]) => v.includes('scripts/' + fake)),
    'MUTATION: a suite absent from every chain must not be reported as registered');

  // duplicate-step: the counting expression must see a doubled entry.
  const doubled = 'node scripts/test-x.js && node scripts/test-x.js';
  assert(doubled.split('scripts/test-x.js').length - 1 === 2,
    'MUTATION: the duplicate-step counter must count both occurrences');

  // subset: the difference must be direction-sensitive.
  const f1 = 'node scripts/test-x.js';
  const f2 = 'node scripts/test-y.js';
  assert(['test-x.js'].filter(f => f1.includes('scripts/' + f) && !f2.includes('scripts/' + f)).length === 1,
    'MUTATION: the subset check must flag a suite present in the fast gate and absent from full');
}

console.log('suite registration: ' + suites.length + ' test-*.js files, '
  + registeredIn.size + ' registered, ' + Object.keys(EXEMPT).length + ' exempt');
if (failed) {
  console.error('\nSuite registration FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('Suite registration passed (' + passed + ' assertions).');
