#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// edition-sync.js (issue #365) — scripted edition sync + rename-normalized parity.
//
// Cross-edition propagation used to be hand-copy validated after the fact: a
// canonical engine edit was manually mirrored to the codex tree (byte-checked by
// validate-script-sync COMMON_SCRIPTS) and hand-ported into the gitlab/gitea
// forge-renamed scripts — which were NOT byte-checked, only token-pinned, so live
// drift could (and did, #347) survive all four chains. This tool makes the forge
// AGGREGATOR ports a deterministic function of canonical:
//
//   --write   (npm run sync:editions): regenerate the forge aggregator ports from
//             canonical via the declared rename map, cp the COMMON_SCRIPTS set
//             canonical -> codex, and cp the byte-identical groups across editions.
//             Idempotent: re-running from a clean checkout is a no-op.
//   --check   (wired into the gitlab/gitea chains): recompute each generated forge
//             aggregator port from canonical and assert byte-equality with the
//             committed file. A hand-edit to a generated port (the #347 class) or a
//             canonical edit not propagated turns the chain RED. Exit 1 on mismatch.
//
// SCOPE (locked 2026-06-10, "incremental generation"): only the five forge
// AGGREGATOR ports are generated — they carry NO forge vocabulary beyond script
// names, so a pure rename map reproduces them. The data-layer forge ports
// (claim / sink-merge / sink-pr / repair-state / active-folders / classifier /
// roadmap / plan-validator / ...) stay HAND-PORTED (covered behaviorally per #342)
// and are NOT touched here.
//
// The rename map is DECLARED, not derived from a reference port (a derived map is
// circular — it can never disagree with the file it was read from). A canonical
// script base-name `kaola-workflow-<X>` is renamed to `kaola-<forge>-workflow-<X>`
// IFF a `kaola-<forge>-workflow-<X>.js` port exists on disk. adaptive-schema is
// byte-identical across all four editions (its forge file keeps the canonical name),
// so no renamed file exists for it and it is never renamed — correct.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { COMMON_SCRIPTS, BYTE_IDENTICAL_GROUPS } = require('./validate-script-sync');

const REPO = path.resolve(__dirname, '..');
const FORGES = ['gitlab', 'gitea'];

// The five forge aggregator ports generated from canonical (issue #365 scope).
const GENERATED_AGGREGATORS = [
  'kaola-workflow-adaptive-node.js',
  'kaola-workflow-next-action.js',
  'kaola-workflow-commit-node.js',
  'kaola-workflow-parallel-batch.js',
  'kaola-workflow-adaptive-handoff.js',
];

const canonRel = base => 'scripts/' + base;
const codexRel = base => 'plugins/kaola-workflow/scripts/' + base;
const forgeBase = (base, forge) => base.replace(/^kaola-workflow-/, `kaola-${forge}-workflow-`);
const forgeRel = (base, forge) => `plugins/kaola-workflow-${forge}/scripts/${forgeBase(base, forge)}`;

// The declared rename set for a forge: every canonical base-name `kaola-workflow-X`
// that has a renamed `kaola-<forge>-workflow-X.js` port on disk. Cached per forge.
const _renameSetCache = {};
function renameSet(forge) {
  if (_renameSetCache[forge]) return _renameSetCache[forge];
  const dir = path.join(REPO, `plugins/kaola-workflow-${forge}/scripts`);
  const names = new Set();
  const re = new RegExp(`^kaola-${forge}-workflow-(.+)\\.js$`);
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(re);
    if (m) names.add(m[1]);
  }
  _renameSetCache[forge] = names;
  return names;
}

function genHeader(base) {
  return '// @generated from scripts/' + base + ' by `npm run sync:editions` (issue #365) — '
    + 'edit canonical and regenerate; do NOT hand-edit this forge port.';
}

// Render a forge aggregator port from canonical content via the declared rename map.
// Renames `kaola-workflow-<NAME>` -> `kaola-<forge>-workflow-<NAME>` for every NAME in
// the forge's rename set, bounded by a non-name-char lookahead so it never partial-
// matches a longer token, a `/command` ref, or the `kaola-workflow/` state directory.
// The @generated header is injected AFTER the rename pass (so it keeps the canonical
// source path) and AFTER the shebang line.
function renderForgePort(canonContent, base, forge) {
  const names = [...renameSet(forge)].sort((a, b) => b.length - a.length);
  if (!names.length) return canonContent;
  const alt = names.map(n => n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
  const re = new RegExp(`kaola-workflow-(${alt})(?![a-zA-Z0-9-])`, 'g');
  const renamed = canonContent.replace(re, (_m, n) => `kaola-${forge}-workflow-${n}`);

  const header = genHeader(base);
  const lines = renamed.split('\n');
  if (lines[0] && lines[0].startsWith('#!')) {
    lines.splice(1, 0, header);
  } else {
    lines.splice(0, 0, header);
  }
  return lines.join('\n');
}

function readFile(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}
function writeFile(rel, content) {
  fs.writeFileSync(path.join(REPO, rel), content);
}

// --- check: recompute every generated port and compare to the committed file. ---
function runCheck() {
  const mismatches = [];
  for (const base of GENERATED_AGGREGATORS) {
    const canon = readFile(canonRel(base));
    for (const forge of FORGES) {
      const rel = forgeRel(base, forge);
      if (!fs.existsSync(path.join(REPO, rel))) {
        mismatches.push({ rel, reason: 'missing port' });
        continue;
      }
      const expected = renderForgePort(canon, base, forge);
      const actual = readFile(rel);
      if (expected !== actual) {
        mismatches.push({ rel, reason: firstDiff(expected, actual) });
      }
    }
  }
  if (mismatches.length) {
    console.error('edition-sync: FORGE AGGREGATOR PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: edit the CANONICAL script in scripts/, then run `npm run sync:editions`.');
    process.exitCode = 1;
    return;
  }
  console.log('edition-sync: ' + (GENERATED_AGGREGATORS.length * FORGES.length)
    + ' forge aggregator ports in rename-normalized parity with canonical.');
}

function firstDiff(expected, actual) {
  const e = expected.split('\n'), a = actual.split('\n');
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] !== a[i]) {
      return 'first diff at line ' + (i + 1) + ': expected ' + JSON.stringify(e[i])
        + ' got ' + JSON.stringify(a[i]);
    }
  }
  return 'content differs';
}

// --- write: regenerate forge aggregators + cp COMMON_SCRIPTS -> codex + byte groups. ---
function runWrite() {
  let wrote = 0;
  // (a) forge aggregator ports.
  for (const base of GENERATED_AGGREGATORS) {
    const canon = readFile(canonRel(base));
    for (const forge of FORGES) {
      const rel = forgeRel(base, forge);
      const next = renderForgePort(canon, base, forge);
      if (!fs.existsSync(path.join(REPO, rel)) || readFile(rel) !== next) {
        writeFile(rel, next);
        console.log('generated  ' + rel);
        wrote++;
      }
    }
  }
  // (b) COMMON_SCRIPTS canonical -> codex (byte copy).
  for (const base of COMMON_SCRIPTS) {
    const canon = readFile(canonRel(base));
    const rel = codexRel(base);
    if (fs.existsSync(path.join(REPO, rel)) && readFile(rel) !== canon) {
      writeFile(rel, canon);
      console.log('codex-sync ' + rel);
      wrote++;
    }
  }
  // (c) byte-identical groups: copy the group's first (source) file to every other path.
  for (const group of BYTE_IDENTICAL_GROUPS) {
    const paths = group.paths || group;
    if (!Array.isArray(paths) || paths.length < 2) continue;
    const src = readFile(paths[0]);
    for (let i = 1; i < paths.length; i++) {
      if (fs.existsSync(path.join(REPO, paths[i])) && readFile(paths[i]) !== src) {
        writeFile(paths[i], src);
        console.log('byte-sync  ' + paths[i]);
        wrote++;
      }
    }
  }
  console.log('edition-sync: write complete (' + wrote + ' file(s) updated'
    + (wrote === 0 ? ' — tree already in sync' : '') + ').');
}

function main() {
  const arg = process.argv[2];
  if (arg === '--check') return runCheck();
  if (arg === '--write') return runWrite();
  process.stdout.write(
    'usage: node scripts/edition-sync.js (--check | --write)\n'
    + '  --check   assert forge aggregator ports match canonical (rename-normalized parity)\n'
    + '  --write   regenerate forge aggregators + cp COMMON_SCRIPTS->codex + byte groups (sync:editions)\n'
  );
}

if (require.main === module) main();

module.exports = { renderForgePort, renameSet, GENERATED_AGGREGATORS, forgeRel, genHeader };
