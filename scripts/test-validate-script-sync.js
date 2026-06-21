#!/usr/bin/env node
'use strict';

// test-validate-script-sync.js (#553) — unit-locks the GENERALIZED forge export-superset guard.
//
// #550 was a forge classifier omitting a cross-required export → TypeError on a failing path no green chain
// hit. #553 generalized that single-classifier guard into a FAMILY over every divergent forge hand-port
// (claim/sink-merge/roadmap/repair-state/active-folders/closure-audit) with a `canonicalOnly` exclude for
// genuinely-edition-specific canonical exports. This test proves the mechanism: the family covers the right
// modules, a real missing cross-required export is CAUGHT, and a canonicalOnly name is correctly EXCLUDED.
// Wired into the claude chain. The live forge ports are validated by validate-script-sync.js itself in
// every claude + codex chain run — this test locks the GUARD LOGIC against regression.

const path = require('path');
const sync = require('./validate-script-sync.js');

const repoRoot = path.resolve(__dirname, '..');
let failed = 0, passed = 0;
function assert(cond, msg) { if (cond) { passed++; return; } failed++; process.stderr.write('FAIL: ' + msg + '\n'); }

// 1) The family generalizes beyond the classifier to the divergent cross-required hand-ports.
const fam = sync.FORGE_EXPORT_SUPERSET_FAMILY;
assert(Array.isArray(fam) && fam.length >= 7, '#553: FORGE_EXPORT_SUPERSET_FAMILY has >=7 entries, got ' + (fam && fam.length));
const bases = fam.map(e => path.basename(e.canonical));
for (const need of ['kaola-workflow-classifier.js', 'kaola-workflow-claim.js', 'kaola-workflow-sink-merge.js', 'kaola-workflow-roadmap.js', 'kaola-workflow-repair-state.js', 'kaola-workflow-active-folders.js', 'kaola-workflow-closure-audit.js']) {
  assert(bases.includes(need), '#553: family covers ' + need);
}
// Backward-compat: the original classifier entry + symbol are still exported.
assert(sync.FORGE_CLASSIFIER_EXPORT_SUPERSET && fam[0] === sync.FORGE_CLASSIFIER_EXPORT_SUPERSET, '#553: classifier entry preserved as family[0] (backward-compat)');
assert(typeof sync.forgeClassifierExportDrift === 'function', '#553: forgeClassifierExportDrift still exported');

// 2) The canonicalOnly excludes are present + scoped to the edition-specific names we verified.
const claimEntry = fam.find(e => path.basename(e.canonical) === 'kaola-workflow-claim.js');
const repairEntry = fam.find(e => path.basename(e.canonical) === 'kaola-workflow-repair-state.js');
assert(claimEntry.canonicalOnly && claimEntry.canonicalOnly.includes('ghExec'), '#553: claim canonicalOnly excludes ghExec (GitHub-specific exec helper)');
assert(repairEntry.canonicalOnly && repairEntry.canonicalOnly.includes('projectHasAdaptivePlan'), '#553: repair-state canonicalOnly excludes projectHasAdaptivePlan (canonical-only consumer-detection)');

// 3) Every live family entry is currently a superset (no drift) — the guard is GREEN at HEAD.
for (const entry of fam) {
  const res = sync.forgeClassifierExportDrift(repoRoot, entry);
  assert(res.missingModules.length === 0, '#553: ' + entry.label + ' — all modules load, got missing ' + JSON.stringify(res.missingModules));
  assert(res.driftPorts.length === 0, '#553: ' + entry.label + ' — no export drift, got ' + JSON.stringify(res.driftPorts.map(p => ({ f: p.forge, k: p.missingKeys }))));
}

// 4) MECHANISM: a synthetic family entry whose forge port omits a canonical export is CAUGHT (RED-provable),
//    and a canonicalOnly entry SUPPRESSES exactly that — proving the subtraction is wired, not cosmetic.
//    Use claim canonical vs the classifier port (which lacks claim's exports) as a guaranteed-drifting pair.
const driftEntry = { label: 'synthetic drift', canonical: 'scripts/kaola-workflow-claim.js',
  ports: [{ forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js' }] };
const driftRes = sync.forgeClassifierExportDrift(repoRoot, driftEntry);
assert(driftRes.driftPorts.length === 1 && driftRes.driftPorts[0].missingKeys.length > 0,
  '#553: a forge port missing canonical exports is CAUGHT (guard is not vacuous), got ' + JSON.stringify(driftRes.driftPorts));
const caughtKeys = driftRes.driftPorts[0].missingKeys;
// canonicalOnly listing ALL the caught keys must suppress the drift entirely (subtraction proven).
const suppressed = sync.forgeClassifierExportDrift(repoRoot, { ...driftEntry, canonicalOnly: caughtKeys });
assert(suppressed.driftPorts.length === 0, '#553: canonicalOnly subtracts the excluded names (drift suppressed when all caught keys excluded), got ' + JSON.stringify(suppressed.driftPorts));

if (failed) { process.stderr.write('\nvalidate-script-sync guard tests FAILED (' + failed + ' failures, ' + passed + ' passed)\n'); process.exit(1); }
process.stdout.write('validate-script-sync guard tests passed (' + passed + ' assertions)\n');
