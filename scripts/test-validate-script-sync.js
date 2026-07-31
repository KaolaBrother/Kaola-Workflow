#!/usr/bin/env node
'use strict';

// test-validate-script-sync.js (#553) — unit-locks the GENERALIZED forge export-superset guard.
//
// #550 was a forge classifier omitting a cross-required export → TypeError on a failing path no green chain
// hit. #553 generalized that single-classifier guard into a FAMILY over every divergent forge hand-port
// (claim/sink-merge/roadmap/active-folders/closure-audit) with a `canonicalOnly` exclude for
// genuinely-edition-specific canonical exports. This test proves the mechanism: the family covers the right
// modules, a real missing cross-required export is CAUGHT, and a canonicalOnly name is correctly EXCLUDED.
// Wired into the claude chain. The live forge ports are validated by validate-script-sync.js itself in
// every claude + codex chain run — this test locks the GUARD LOGIC against regression.

const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('./validate-script-sync.js');
// The suites' single process-boundary decision point for git. Fixture arrangement and git
// interrogation both route through it, so this file adds no independent decision to spawn git.
const G = require('./test-git-fixture.js');

const repoRoot = path.resolve(__dirname, '..');
let failed = 0, passed = 0;
function assert(cond, msg) { if (cond) { passed++; return; } failed++; process.stderr.write('FAIL: ' + msg + '\n'); }

// Issue #699 registration guard: replan is canonical<->Codex byte-identical, and closure-contract
// stays byte-identical across all four editions.
assert((sync.COMMON_SCRIPTS || []).includes('kaola-workflow-run-chains.js'),
  'COMMON_SCRIPTS enrolls kaola-workflow-run-chains.js');
for (const base of ['kaola-workflow-closure-contract.js']) {
  const group = (sync.BYTE_IDENTICAL_GROUPS || []).find(g => (g.files || []).some(f => f === 'scripts/' + base));
  assert(group && group.files.length === 4,
    '#699: ' + base + ' remains a four-edition byte-identical group');
}

// --- CROSS-EDITION DRIFT ANCHOR (rationale inversion: gitignored -> tracked) -------------------
// This assertion used to demand the OPPOSITE — that the adaptive-schema group be ABSENT, because the
// forge copies were gitignored and "one committed copy = nothing to police". The copies were tracked
// again, the assertion was not revisited, and it then actively PINNED the hole: appending a line to
// the gitea kernel copy passed validate-script-sync, edition-sync --check and validate-workflow-
// contracts. A guard whose premise is "the file is not committed" must be re-derived from git, not
// from a comment — so the premise is asserted here directly.
const kernelGroup = (sync.BYTE_IDENTICAL_GROUPS || []).find(g => (g.files || []).some(f => f === 'scripts/kaola-workflow-adaptive-schema.js'));
assert(kernelGroup && kernelGroup.files.length === 4,
  'XED-1: the adaptive-schema kernel is a four-edition byte-identical group (its forge copies are TRACKED, so they are policed)');
assert(Array.isArray(sync.KERNEL_COPIES) && sync.KERNEL_COPIES.length === 4
  && sync.KERNEL_COPIES[0] === 'scripts/kaola-workflow-adaptive-schema.js',
  'XED-1: KERNEL_COPIES single-sources the four kernel paths, canonical first');
assert(kernelGroup && kernelGroup.files === sync.KERNEL_COPIES,
  'XED-1: the kernel byte group and the committed-parity check read the SAME path list');
// The premise itself, measured: every kernel copy must be tracked by git. If a future change
// re-gitignores them, THIS fails and forces the policing question to be re-answered deliberately.
{
  const tracked = new Set(
    G.out(repoRoot, ['ls-files', '--'].concat(sync.KERNEL_COPIES))
      .split('\n').map(s => s.trim()).filter(Boolean));
  for (const rel of sync.KERNEL_COPIES) {
    assert(tracked.has(rel),
      'XED-1: ' + rel + ' is tracked by git — consumers clone committed bytes, so an untracked copy changes what must be policed');
  }
}
// The committed-blob half exists, is exported, and is GREEN at HEAD.
assert(typeof sync.checkCommittedKernelParity === 'function',
  'XED-1: checkCommittedKernelParity is exported (shared by validate-script-sync and edition-sync --check)');
{
  const res = sync.checkCommittedKernelParity(repoRoot);
  assert(res.skipped === null, 'XED-1: committed kernel parity runs (not skipped) inside a git checkout, got skip=' + res.skipped);
  assert(res.drift.length === 0, 'XED-1: the four committed kernel blobs are one object at HEAD, got ' + JSON.stringify(res.drift));
}
// MUTATION: the committed check must REJECT a repo whose committed kernel copies disagree. Built as a
// throwaway git repo so the assertion is proven armed rather than merely green (a check that only ever
// sees a healthy tree is indistinguishable from a check that always passes).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-parity-'));
  try {
    G.init(tmp);
    for (const rel of sync.KERNEL_COPIES) {
      fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), 'module.exports = {};\n');
    }
    G.commitAll(tmp, 'clean');
    let res = sync.checkCommittedKernelParity(tmp);
    assert(res.drift.length === 0 && res.skipped === null,
      'XED-1 MUTATION: a correctly-synced committed tree must PASS, got ' + JSON.stringify(res));

    // (a) one forge copy drifts in the COMMIT — the exact XED-1 mutation.
    const gitea = sync.KERNEL_COPIES[3];
    fs.appendFileSync(path.join(tmp, gitea), '// drift\n');
    G.commitAll(tmp, 'drift');
    res = sync.checkCommittedKernelParity(tmp);
    assert(res.drift.length === 1 && res.drift[0].includes(gitea),
      'XED-1 MUTATION: a drifted COMMITTED forge kernel copy must be REJECTED and NAMED, got ' + JSON.stringify(res.drift));

    // (b) the working tree being repaired (as the --materialize-kernel chain preamble does) must
    // NOT launder the drifted commit — this is the whole reason the check reads git.
    fs.copyFileSync(path.join(tmp, sync.KERNEL_COPIES[0]), path.join(tmp, gitea));
    res = sync.checkCommittedKernelParity(tmp);
    assert(res.drift.length === 1,
      'XED-1 MUTATION: repairing the WORKING COPY must not clear a drifted COMMIT (the materialize-preamble laundering path), got ' + JSON.stringify(res.drift));

    // (c) a forge copy that is not committed at all is the fresh-clone module-resolution failure.
    G.git(tmp, ['rm', '-q', '--cached', gitea]);
    G.commit(tmp, 'untrack');
    res = sync.checkCommittedKernelParity(tmp);
    assert(res.drift.length === 1 && /NOT COMMITTED/.test(res.drift[0]),
      'XED-1 MUTATION: an uncommitted forge kernel copy must be REJECTED, got ' + JSON.stringify(res.drift));

    // (d) no git history at all -> SKIP, reported, never a false RED.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-parity-nogit-'));
    try {
      res = sync.checkCommittedKernelParity(bare);
      assert(res.drift.length === 0 && typeof res.skipped === 'string',
        'XED-1 MUTATION: a non-checkout must SKIP with a reason, not fail, got ' + JSON.stringify(res));
    } finally { fs.rmSync(bare, { recursive: true, force: true }); }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 1) The family generalizes beyond the classifier to the divergent cross-required hand-ports.
const fam = sync.FORGE_EXPORT_SUPERSET_FAMILY;
// The floor was 7 while repair-state was a cross-required hand-port; it is deleted, so the
// family is the six that remain. What the floor is for — proving the guard is not empty — holds.
assert(Array.isArray(fam) && fam.length >= 6, '#553: FORGE_EXPORT_SUPERSET_FAMILY has >=6 entries, got ' + (fam && fam.length));
const bases = fam.map(e => path.basename(e.canonical));
for (const need of ['kaola-workflow-classifier.js', 'kaola-workflow-claim.js', 'kaola-workflow-sink-merge.js', 'kaola-workflow-roadmap.js', 'kaola-workflow-active-folders.js', 'kaola-workflow-closure-audit.js']) {
  assert(bases.includes(need), '#553: family covers ' + need);
}
// Backward-compat: the original classifier entry + symbol are still exported.
assert(sync.FORGE_CLASSIFIER_EXPORT_SUPERSET && fam[0] === sync.FORGE_CLASSIFIER_EXPORT_SUPERSET, '#553: classifier entry preserved as family[0] (backward-compat)');
assert(typeof sync.forgeClassifierExportDrift === 'function', '#553: forgeClassifierExportDrift still exported');

// 2) The canonicalOnly excludes are present + scoped to the edition-specific names we verified.
const claimEntry = fam.find(e => path.basename(e.canonical) === 'kaola-workflow-claim.js');

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

// 5) #564: machine-guard the canonicalOnly EXCLUSIONS. Each canonicalOnly name is SUBTRACTED from the
//    forge export-superset requirement on the premise that the name is GENUINELY edition-specific — NOT
//    cross-required by any forge script. That premise is currently a MANUAL invariant (ghExec /
//    projectHasAdaptivePlan have 0 forge refs today). Machine-enforce it: for each canonicalOnly name,
//    scan the TWO FORGE TREES (gitlab/gitea — derived from the entry's ports[].file) for a CODE-context
//    occurrence and assert ZERO. A future canonicalOnly entry naming a genuinely cross-required export
//    goes RED here, so the exclusion list can never silently hide a cross-required name and re-open the
//    #550 crash class. Codex (plugins/kaola-workflow) is DELIBERATELY NOT scanned: it is a COMMON
//    byte-identical copy of the canonical and legitimately uses both names — including it would make this
//    assertion spuriously fail (the scope error called out in the #564 fix note).
const forgeTreeRoot = portFile => portFile.split('/').slice(0, 2).join('/'); // plugins/kaola-workflow-<forge>
function listJsFiles(absDir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...listJsFiles(abs));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(abs);
  }
  return out;
}
// Blank out comments AND quoted string/template spans so the scan matches a name only in CODE context
// (a require-destructure / property access), not a comment or an error-message string mention.
function codeOnly(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  return s.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
}
let canonicalOnlyChecked = 0;
for (const entry of sync.FORGE_EXPORT_SUPERSET_FAMILY) {
  if (!entry.canonicalOnly || !entry.canonicalOnly.length) continue;
  const roots = [...new Set((entry.ports || []).map(p => forgeTreeRoot(p.file)))];
  for (const name of entry.canonicalOnly) {
    const re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    const hits = [];
    for (const root of roots) {
      for (const abs of listJsFiles(path.join(repoRoot, root))) {
        let src; try { src = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
        codeOnly(src).split('\n').forEach((line, i) => { if (re.test(line)) hits.push(path.relative(repoRoot, abs) + ':' + (i + 1)); });
      }
    }
    canonicalOnlyChecked++;
    assert(hits.length === 0,
      '#564: canonicalOnly "' + name + '" (excluded from the ' + entry.label + ' superset check) is REFERENCED in a forge ' +
      'tree — excluding a cross-required export can silently re-open the #550 crash class. Either drop it from canonicalOnly ' +
      '(so the superset check requires the forge port to export it) or stop referencing it in the forge tree. Hits:\n  ' + hits.join('\n  '));
  }
}
// The floor was 2 while repair-state contributed `projectHasAdaptivePlan`; that port is deleted, so
// `ghExec` is the one canonicalOnly name left. The guard's subject is unchanged.
assert(canonicalOnlyChecked >= 1,
  '#564: expected >=1 canonicalOnly name guarded (ghExec), got ' + canonicalOnlyChecked +
  ' — the family lost its canonicalOnly entries (or the scan is broken)');

// ---------------------------------------------------------------------------
// 6) #629 bullet 1: HOOKS_JSON_FAMILY — hooks/hooks.json root+gitlab+gitea parity,
//    compact-context token rename-normalized (MIRRORS CONFIG_HOOKS_FAMILY).
// ---------------------------------------------------------------------------
assert(sync.HOOKS_JSON_FAMILY && sync.HOOKS_JSON_FAMILY.reference === 'hooks/hooks.json',
  '#629 bullet 1: HOOKS_JSON_FAMILY declared with hooks/hooks.json as reference');
assert(typeof sync.normalizeHooksJson === 'function', '#629 bullet 1: normalizeHooksJson exported');
assert(typeof sync.checkNormalizedFamily === 'function',
  '#629 bullet 1: checkNormalizedFamily exported (shared family-check primitive)');

// 6a) MECHANISM (RED-PROOF): plant a new PreToolUse matcher into a root-copy FIXTURE without
// mirroring it into the forge copies -> the family check must report drift for every port.
// Runs entirely against a throwaway tmp tree — never touches the real hooks/hooks.json files.
if (sync.HOOKS_JSON_FAMILY && typeof sync.checkNormalizedFamily === 'function') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-hooksjson-plant-'));
  try {
    const rootHooksText = fs.readFileSync(path.join(repoRoot, 'hooks/hooks.json'), 'utf8');
    const rootHooks = JSON.parse(rootHooksText);
    // plant an extra SubagentStart matcher (drift) into the fixture root copy only.
    rootHooks.hooks.SubagentStart.push({
      matcher: 'PLANTED-DRIFT',
      hooks: [{ type: 'command', command: 'echo planted', timeout: 5 }],
      description: 'planted drift (test fixture only, never written to a real file)',
      id: 'kaola-workflow:planted-drift-fixture',
    });
    const plantedText = JSON.stringify(rootHooks, null, 2) + '\n';
    fs.mkdirSync(path.join(tmp, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'hooks/hooks.json'), plantedText);
    for (const port of sync.HOOKS_JSON_FAMILY.ports) {
      fs.mkdirSync(path.dirname(path.join(tmp, port.file)), { recursive: true });
      // forge fixture copies stay at the UN-planted, already-normalized content (no forge mirror
      // of the plant exists) — the exact "missing mirror" scenario the bullet describes.
      fs.writeFileSync(path.join(tmp, port.file), sync.normalizeHooksJson(rootHooksText, port.forge));
    }
    const res = sync.checkNormalizedFamily(sync.HOOKS_JSON_FAMILY, sync.normalizeHooksJson, tmp, 'compact-context-normalized');
    assert(res.drift.length === sync.HOOKS_JSON_FAMILY.ports.length,
      '#629 bullet 1 RED-PROOF: a PreToolUse matcher planted into the root fixture only (no forge mirror) reds for every port, got ' + JSON.stringify(res));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 6b) GREEN AT HEAD: the real hooks/hooks.json triple is ALREADY in normalized parity (verified) —
// the fix is guard-config only; no write to the hooks.json data files.
if (sync.HOOKS_JSON_FAMILY && typeof sync.checkNormalizedFamily === 'function') {
  const res = sync.checkNormalizedFamily(sync.HOOKS_JSON_FAMILY, sync.normalizeHooksJson, repoRoot, 'compact-context-normalized');
  assert(res.missing.length === 0 && res.drift.length === 0,
    '#629 bullet 1: the real hooks/hooks.json triple is green at HEAD (already normalized parity), got ' + JSON.stringify(res));
}

// ---------------------------------------------------------------------------
// 7) #629 bullet 2: config/agents.toml BYTE_IDENTICAL_GROUPS entry — the three
//    plugins/*/config/agents.toml files are byte-identical at HEAD but were previously
//    uncovered (only derived NAME parity was forge-checked).
// ---------------------------------------------------------------------------
const agentsTomlGroup = (sync.BYTE_IDENTICAL_GROUPS || []).find(g => g.label === 'config/agents.toml triple');
assert(!!agentsTomlGroup, '#629 bullet 2: BYTE_IDENTICAL_GROUPS carries a config/agents.toml triple entry');
assert(typeof sync.checkByteIdenticalGroup === 'function',
  '#629 bullet 2: checkByteIdenticalGroup exported (shared byte-group-check primitive)');

// 7a) MECHANISM (RED-PROOF): a divergent byte planted into one copy FIXTURE (not a real file) is CAUGHT.
if (agentsTomlGroup && typeof sync.checkByteIdenticalGroup === 'function') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-agentstoml-plant-'));
  try {
    const refText = fs.readFileSync(path.join(repoRoot, agentsTomlGroup.files[0]), 'utf8');
    for (let i = 0; i < agentsTomlGroup.files.length; i++) {
      const rel = agentsTomlGroup.files[i];
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      // plant a divergent developer_instructions byte into the SECOND copy only.
      const tampered = i === 1 ? refText + '\ndeveloper_instructions = "PLANTED-DRIFT"\n' : refText;
      fs.writeFileSync(path.join(tmp, rel), tampered);
    }
    const res = sync.checkByteIdenticalGroup(agentsTomlGroup, tmp);
    assert(res.missing.length === 0 && res.drift.length === 1,
      '#629 bullet 2 RED-PROOF: a divergent developer_instructions byte planted in one copy fixture reds, got ' + JSON.stringify(res));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 7b) GREEN AT HEAD: the real config/agents.toml triple is byte-identical (md5 579c8575...).
if (agentsTomlGroup && typeof sync.checkByteIdenticalGroup === 'function') {
  const res = sync.checkByteIdenticalGroup(agentsTomlGroup, repoRoot);
  assert(res.missing.length === 0 && res.drift.length === 0,
    '#629 bullet 2: the real config/agents.toml triple is byte-identical at HEAD, got ' + JSON.stringify(res));
}

// ---------------------------------------------------------------------------
// 8) The deterministic validation runner is one forge-neutral, byte-identical
//    four-file family. Lock the exact paths, create-on-missing behavior for EACH
//    member, drift detection, and live parity.
// ---------------------------------------------------------------------------
const validationRunnerFiles = [
  'scripts/kaola-workflow-validation-runner.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js',
];
const validationRunnerGroup = (sync.BYTE_IDENTICAL_GROUPS || []).find(g => g.label === 'validation-runner module copies');
assert(!!validationRunnerGroup, 'validation runner has a dedicated byte-identical group');
if (validationRunnerGroup) {
  assert(JSON.stringify(validationRunnerGroup.files) === JSON.stringify(validationRunnerFiles),
    'validation runner byte group carries the exact canonical/codex/gitlab/gitea paths, got ' + JSON.stringify(validationRunnerGroup.files));
  const referenceBytes = fs.readFileSync(path.join(repoRoot, validationRunnerFiles[0]));

  // Exact create-on-missing proof: omit each member in turn. A missing reference
  // stops comparison at that reference; a missing copy names exactly that copy.
  for (let missingIndex = 0; missingIndex < validationRunnerFiles.length; missingIndex++) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validation-runner-missing-'));
    try {
      for (let index = 0; index < validationRunnerFiles.length; index++) {
        if (index === missingIndex) continue;
        const destination = path.join(tmp, validationRunnerFiles[index]);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, referenceBytes);
      }
      const result = sync.checkByteIdenticalGroup(validationRunnerGroup, tmp);
      assert(JSON.stringify(result.missing) === JSON.stringify([validationRunnerFiles[missingIndex]]) && result.drift.length === 0,
        'validation runner create-on-missing identifies exactly ' + validationRunnerFiles[missingIndex] + ', got ' + JSON.stringify(result));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validation-runner-drift-'));
  try {
    for (let index = 0; index < validationRunnerFiles.length; index++) {
      const destination = path.join(tmp, validationRunnerFiles[index]);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, index === 2 ? Buffer.concat([referenceBytes, Buffer.from('\nDRIFT\n')]) : referenceBytes);
    }
    const result = sync.checkByteIdenticalGroup(validationRunnerGroup, tmp);
    assert(result.missing.length === 0 && result.drift.length === 1 && result.drift[0].includes(validationRunnerFiles[2]),
      'validation runner one-byte-family drift is caught at the exact copy, got ' + JSON.stringify(result));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const live = sync.checkByteIdenticalGroup(validationRunnerGroup, repoRoot);
  assert(live.missing.length === 0 && live.drift.length === 0,
    'live validation runner four-file family is present and byte-identical, got ' + JSON.stringify(live));
}

if (failed) { process.stderr.write('\nvalidate-script-sync guard tests FAILED (' + failed + ' failures, ' + passed + ' passed)\n'); process.exit(1); }
process.stdout.write('validate-script-sync guard tests passed (' + passed + ' assertions; ' + canonicalOnlyChecked + ' canonicalOnly exclusions machine-guarded)\n');
