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

// The chain validators that READ + ASSERT ON real-repo prose (docs/**, root README/CHANGELOG). Scanned
// for any allowband-member prose literal they reference; route-reachability/profile-parity read only
// commands/agents/SKILL prose, which is already CODE under #424 (isBarrierInvisible=false), so they need
// no entry here. Forge contract validators are included so a future forge-side doc assertion is caught.
const VALIDATOR_FILES = [
  'scripts/validate-workflow-contracts.js',
  'scripts/validate-kaola-workflow-contracts.js',
  'scripts/validate-vendored-agents.js',
  'plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js',
  'plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js',
];

// A prose literal (single/double quoted) that is an allowband member (docs/**, root README/CHANGELOG).
const PROSE_LITERAL = /['"](docs\/[A-Za-z0-9_./-]+\.md|README\.md|CHANGELOG\.md)['"]/g;

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

if (failed) {
  process.stderr.write('\nvalidation-allowband guard FAILED (' + failed + ' failures, ' + passed + ' passed)\n');
  process.exit(1);
}
process.stdout.write('validation-allowband guard passed (' + passed + ' assertions; ' + referenced.size + ' validator-referenced prose files all kept as CODE)\n');
