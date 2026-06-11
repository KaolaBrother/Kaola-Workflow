#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-install-manifest-single-source.js (issue #407 — #365 deferred half)
//
// Proves install.sh's per-forge SUPPORT_SCRIPT_NAMES / SUPPORT_HOOK_NAMES are
// SINGLE-SOURCED from scripts/kaola-workflow-install-manifest.js:
//
//   1. The manifest emits exactly the support set for each forge (set + order
//      stable), and a new shared support script is picked up WITHOUT an install.sh
//      edit — the core "≤2 places to register a shared script" #365 acceptance.
//   2. The manifest exits non-zero (writing nothing) on an empty/invalid emission
//      so install.sh's empty-array guard fails loud (anti 5.4.0 silent-empty).
//   3. install.sh actually consumes the manifest (no residual hand-maintained
//      SUPPORT_*_NAMES=( ... ) arrays, the manifest shell-out is present).
// ---------------------------------------------------------------------------

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifestScript = path.join(root, 'scripts', 'kaola-workflow-install-manifest.js');
const manifest = require(manifestScript);

function emit(args, env) {
  return spawnSync(process.execPath, [manifestScript, ...args], { encoding: 'utf8', env: env || process.env });
}

// --- 1. Per-forge emission parity: CLI lines === the exported supportScripts/supportHooks. ---
for (const forge of manifest.FORGES) {
  const cliScripts = emit(['--forge=' + forge, '--scripts']);
  assert.strictEqual(cliScripts.status, 0, `manifest --scripts ${forge} must exit 0: ${cliScripts.stderr}`);
  const lines = cliScripts.stdout.trim().split('\n');
  assert.deepStrictEqual(lines, manifest.supportScripts(forge),
    `#407: CLI --scripts ${forge} must equal supportScripts('${forge}')`);

  const cliHooks = emit(['--forge=' + forge, '--hooks']);
  assert.strictEqual(cliHooks.status, 0, `manifest --hooks ${forge} must exit 0: ${cliHooks.stderr}`);
  assert.deepStrictEqual(cliHooks.stdout.trim().split('\n'), manifest.supportHooks(forge),
    `#407: CLI --hooks ${forge} must equal supportHooks('${forge}')`);
}

// --- 1b. NEW shared script picked up with NO install.sh edit: append a planted base to a COPY of
//     the manifest module (a fresh require of a temp clone with one extra SUPPORT_SCRIPTS entry) and
//     assert it appears in every forge's emission under the correct rename. This models "register
//     once in the manifest" — install.sh, which only reads the emitted lines, needs no change. ---
{
  const planted = 'kaola-workflow-planted-probe.js';
  const original = fs.readFileSync(manifestScript, 'utf8');
  assert.ok(original.includes("'kaola-workflow-task-mirror.js',"),
    '#407: manifest must contain the task-mirror anchor used by the plant');
  const patched = original.replace(
    "  'kaola-workflow-ledger-compare.js',\n]);",
    "  'kaola-workflow-ledger-compare.js',\n  '" + planted + "',\n]);");
  assert.notStrictEqual(patched, original, '#407: plant must modify SUPPORT_SCRIPTS');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-407-plant-'));
  try {
    // The patched clone must live in scripts/ so its repoRoot + plugin-dir probes resolve identically.
    const clone = path.join(root, 'scripts', '.kw-407-plant-manifest.js');
    fs.writeFileSync(clone, patched);
    try {
      const cloned = require(clone);
      // github: no rename → the planted base appears verbatim.
      assert.ok(cloned.supportScripts('github').includes(planted),
        '#407: a new SUPPORT_SCRIPTS entry must appear in the github emission without an install.sh edit');
      // gitlab/gitea: prefix rename only IFF a port exists on disk; the probe has no port, so it
      // stays the canonical base name (byte-identical-shared semantics) — still emitted, never dropped.
      for (const forge of ['gitlab', 'gitea']) {
        assert.ok(cloned.supportScripts(forge).includes(planted),
          `#407: planted base must still be emitted for ${forge} (no port → canonical name kept)`);
      }
    } finally {
      fs.rmSync(clone, { force: true });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- 2. Empty/invalid guards: unknown forge + missing mode exit non-zero with no stdout. ---
{
  const badForge = emit(['--forge=bitbucket', '--scripts']);
  assert.notStrictEqual(badForge.status, 0, '#407: unknown forge must exit non-zero');
  assert.strictEqual(badForge.stdout.trim(), '', '#407: unknown forge must emit nothing on stdout');

  const noMode = emit(['--forge=github']);
  assert.notStrictEqual(noMode.status, 0, '#407: missing --scripts/--hooks must exit non-zero');

  const badArg = emit(['--forge=github', '--scripts', '--bogus']);
  assert.notStrictEqual(badArg.status, 0, '#407: unknown argument must exit non-zero');
}

// --- 3. install.sh consumes the manifest and carries no residual hand-maintained arrays. ---
{
  const installSh = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  assert.ok(installSh.includes('kaola-workflow-install-manifest.js'),
    '#407: install.sh must shell the install manifest');
  assert.ok(installSh.includes('--forge="$FORGE" --scripts') && installSh.includes('--forge="$FORGE" --hooks'),
    '#407: install.sh must read both --scripts and --hooks from the manifest');
  // The 3 hand-maintained `SUPPORT_SCRIPT_NAMES=(` literal-array openings (with a script name on the
  // next line) must be gone — only the manifest-fed `SUPPORT_SCRIPT_NAMES=()` empty init remains.
  assert.ok(!/SUPPORT_SCRIPT_NAMES=\(\s*\n\s*kaola-/.test(installSh),
    '#407: install.sh must not retain a hand-maintained SUPPORT_SCRIPT_NAMES array literal');
  assert.ok(!/SUPPORT_HOOK_NAMES=\(\s*\n\s*kaola-/.test(installSh),
    '#407: install.sh must not retain a hand-maintained SUPPORT_HOOK_NAMES array literal');
}

// --- 4. #412: kaola-workflow-ledger-compare.js must be in supportScripts for ALL forges. ---
// This guards against the #399 ledger-regression guard silently disarming on manual install.
for (const forge of manifest.FORGES) {
  const scripts = manifest.supportScripts(forge);
  // ledger-compare is byte-identical across editions, so no forge-port rename — the canonical
  // name must appear verbatim in every forge's support set.
  assert.ok(
    scripts.includes('kaola-workflow-ledger-compare.js'),
    `#412: kaola-workflow-ledger-compare.js must be in supportScripts('${forge}') — got: [${scripts.join(', ')}]`
  );
}

console.log('test-install-manifest-single-source (#407/#412): PASSED');
