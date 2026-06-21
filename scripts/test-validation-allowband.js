#!/usr/bin/env node
'use strict';

// test-validation-allowband.js (#547 — D-547-01)
//
// The #547 chain-receipt code-tree-hash freshness band EXCLUDES the narrow #424 allowband (docs/**,
// root README/CHANGELOG, the workflow-state tree) from the hash so a docs-only / state-only commit does
// not force a wasteful four-chain re-run. That is SAFE only if NO chain test reads + asserts on an
// excluded file: a file the chains actually verify is VERDICT-AFFECTING and MUST stay CODE (in the
// hash), or a real regression to it could be cited-as-unchanged and ship green (the accuracy hole the
// issue warns against — precedence #1).
//
// `isValidationInvisible` keeps such prose as CODE via the `SELF_HOST_TEST_CONSUMED` keep-as-code list
// (+ the per-plan `validation_test_consumes` widening). THIS guard makes that list non-drifting: it
// statically scans every chain validator for allowband-member prose literals it references and asserts
// each one is in `testConsumes`. A future validator that starts reading docs/newdoc.md without adding it
// to the list goes RED here — so the list can never silently fall behind the tests (fail-closed by
// machine enforcement, not by memory). Over-inclusion only costs an extra re-run, never a missed
// regression, so the guard errs toward MORE files as code.
//
// CI/dev-only (not a runtime SUPPORT script). Wired into the claude chain.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const pv = require('./kaola-workflow-plan-validator.js');

let failed = 0;
let passed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  process.stderr.write('FAIL: ' + msg + '\n');
}

// #560: DERIVE the scan set from the ACTUAL chain definitions instead of a hardcoded list, so a NEW chain
// VALIDATOR that reads + asserts on a real-repo doc is automatically covered (no silent gap — the latent
// hole #547 itself warned about). Parse the four package.json `test:kaola-workflow:*` command strings
// (` && `-joined single lines), extract each `node <file>.js` invocation, and KEEP ONLY the contract
// VALIDATORS (validate-*.js): they read + assert on REAL repo prose, whereas test-*.js / simulate-*.js use
// docs/** strings as TMPDIR FIXTURES — scanning those would false-flag a fixture path as a verdict-affecting
// read (empirically 8 such files exist). Union across all four chains; existing files only (a forge tree may
// be partial). Fail-CLOSED: the legacy hardcoded set is always re-added, so a chain-parse miss can only ADD
// coverage, never shrink below today.
const LEGACY_VALIDATOR_FILES = [
  'scripts/validate-workflow-contracts.js',
  'scripts/validate-kaola-workflow-contracts.js',
  'scripts/validate-vendored-agents.js',
  'plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js',
  'plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js',
];
function deriveValidatorFiles() {
  const out = new Set();
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')); } catch (_) { pkg = null; }
  const scripts = (pkg && pkg.scripts) || {};
  for (const chain of ['claude', 'codex', 'gitlab', 'gitea']) {
    const cmd = scripts['test:kaola-workflow:' + chain];
    if (typeof cmd !== 'string') continue;
    for (const seg of cmd.split('&&')) {
      const m = seg.trim().match(/^node\s+(\S+\.js)\b/); // the leading `node <file>.js` verb (ignores `node -e`)
      if (!m) continue;
      const rel = m[1];
      if (!/(?:^|\/)validate-[A-Za-z0-9-]+\.js$/.test(rel)) continue; // validators only (real-repo prose readers)
      if (fs.existsSync(path.join(repoRoot, rel))) out.add(rel);
    }
  }
  for (const f of LEGACY_VALIDATOR_FILES) if (fs.existsSync(path.join(repoRoot, f))) out.add(f); // fail-closed floor
  return [...out];
}
const VALIDATOR_FILES = deriveValidatorFiles();

// A prose literal (single/double quoted) that is an allowband member (docs/**, root README/CHANGELOG).
const PROSE_LITERAL = /['"](docs\/[A-Za-z0-9_./-]+\.md|README\.md|CHANGELOG\.md)['"]/g;
// #560: a doc path BUILT via a segmented path.join (e.g. path.join(root,'docs','api.md')) is invisible to
// the quoted-literal scan above. Detected separately as an ADVISORY (non-fatal) so a future validator that
// reads a doc via a computed path is surfaced for review rather than silently slipping the freshness band.
const SEGMENTED_DOC_JOIN = /path\.join\([^)]*['"](?:docs|README\.md|CHANGELOG\.md)['"][^)]*\)/;

// 1) Static-scan guard: every allowband-member prose literal a chain validator references must be in
//    the keep-as-code set, else a change to it could be cited-as-unchanged and skip the chains.
const referenced = new Set();
for (const rel of VALIDATOR_FILES) {
  const abs = path.join(repoRoot, rel);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; } // a missing forge tree is not this test's concern
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, ''); // drop line comments (a path in a comment is not an assertion)
    let m;
    PROSE_LITERAL.lastIndex = 0;
    while ((m = PROSE_LITERAL.exec(line)) !== null) {
      const p = m[1];
      if (pv.isBarrierInvisible(p)) referenced.add(p); // only allowband members can be wrongly excluded
    }
  }
}

for (const p of [...referenced].sort()) {
  assert(pv.testConsumes(p) === true,
    'validator-referenced allowband prose "' + p + '" is NOT in testConsumes — it would be excluded from ' +
    'the #547 code-tree hash, so a real change could be cited-as-unchanged and skip the chains. Add it to ' +
    'SELF_HOST_TEST_CONSUMED in kaola-workflow-plan-validator.js (or the plan validators must stop reading it).');
}

// 2) Sanity controls — the band must still EXCLUDE genuinely-inert prose (else the fix de-dups nothing)
//    and INCLUDE the known verdict-affecting set (else accuracy is lost).
assert(pv.isValidationInvisible('docs/architecture.md') === true, 'control: an inert narrative doc must be excluded (so a docs-only commit does not re-run)');
assert(pv.isValidationInvisible('docs/decisions/D-547-01.md') === true, 'control: an inert ADR must be excluded');
assert(pv.isValidationInvisible('docs/api.md') === false, 'control: docs/api.md (chain-asserted) must stay CODE');
assert(pv.isValidationInvisible('README.md') === false, 'control: root README.md (chain-asserted) must stay CODE');
assert(pv.isValidationInvisible('CHANGELOG.md') === false, 'control: root CHANGELOG.md (version-heading asserted) must stay CODE');
assert(referenced.has('docs/api.md'), 'control: the scan must actually find docs/api.md referenced (else the regex/scan is broken)');

// 3) #560 derivation controls — the scan set is now CHAIN-DERIVED (not hardcoded). Prove the package.json
//    parse actually ran (it picks up validate-script-sync.js, which the old hardcoded list omitted) and that
//    it never narrows below the legacy coverage (fail-closed floor).
assert(VALIDATOR_FILES.includes('scripts/validate-script-sync.js'),
  '#560: the derived scan-set must include validate-script-sync.js (proves the package.json chain-parse ran, not just the legacy fallback)');
for (const f of LEGACY_VALIDATOR_FILES) {
  if (!fs.existsSync(path.join(repoRoot, f))) continue; // a missing forge tree is not this test's concern
  assert(VALIDATOR_FILES.includes(f), '#560: the derived scan-set must remain a SUPERSET of the legacy hardcoded validators — missing ' + f);
}

// 4) #560 ADVISORY (non-fatal): surface any segmented-path.join doc construction in the validators the
//    literal scan cannot see. Over-inclusion only costs a re-run; this never fails the guard.
const segmentedAdvisories = [];
for (const rel of VALIDATOR_FILES) {
  let src; try { src = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); } catch (_) { continue; }
  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '');
    if (SEGMENTED_DOC_JOIN.test(line)) segmentedAdvisories.push(rel + ':' + (i + 1));
  });
}
if (segmentedAdvisories.length) {
  process.stdout.write('validation-allowband ADVISORY (#560): segmented path.join doc construction(s) the literal scan cannot see — confirm each is in testConsumes if read at chain time:\n  ' + segmentedAdvisories.join('\n  ') + '\n');
}

if (failed) {
  process.stderr.write('\nvalidation-allowband guard FAILED (' + failed + ' failures, ' + passed + ' passed)\n');
  process.exit(1);
}
process.stdout.write('validation-allowband guard passed (' + passed + ' assertions; ' + referenced.size + ' validator-referenced prose files all kept as CODE)\n');
