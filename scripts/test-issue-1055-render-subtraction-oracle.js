#!/usr/bin/env node
'use strict';
// The one child process in this file is classified per site (ADR 0013), directly above the
// call in currentCommit() below; every other path here is in-process require + hashing.

// ---------------------------------------------------------------------------
// test-issue-1055-render-subtraction-oracle.js — a runnable SUBTRACTION oracle for #1055.
//
// #1055 removes proven-dead code from the five additive-runtime generators
// (sync-{grok,kimi,cursor,opencode,zcode}-edition.js): an inert transformCommandBody line
// loop (its only surviving effect is CRLF -> LF normalization), an unreferenced ZERO_HASH
// constant in all five, an unreferenced lowerSet helper in grok/cursor/opencode, and cursor's
// dead CURSOR_MODEL_CLASS_PINS table + cursorModelPin function. None of that dead code is
// reachable from renderCommand / transformCommandBody's actual output, so a safe subtraction must
// leave every rendered byte identical to before.
//
// This oracle renders every command surface these five modules produce — 5 runtimes x 3 forges x
// 3 commands x 2 line-ending variants (LF, CRLF) = 90 command renders — hashes each, and diffs the
// hashes against the baseline manifest. Kaola-Workflow defines no subagent roles (#1101, ADR
// 0029), so no edition renders an agent profile any more: the 42 former agent renders are
// replaced by the assertion that none of the five modules exports a renderAgent entry point
// (baseline recaptured under #1101: the adapter section and the Cursor role prep text changed with
// the native-only dispatch contract). A hash drift anywhere fails loud with the first differing
// runtime/forge/artifact; a runtime or forge silently skipped from the loop is caught by the
// asserted 90 count, not merely by an emptied diff.
//
// Depends ONLY on the five sync-*-edition.js modules, runtime-edition-forge.js, and the tracked
// commands/*.md canonical sources under templates/routing — never on a generated
// .grok*/.kimi*/.cursor*/.opencode*/.zcode* tree existing on disk, so this suite is not vacuous in a fresh worktree and is safe to register on the focused
// claude chain.
//
// BASELINE POLICY — scripts/fixtures/issue-1055-render-baseline.json is bound to the render
// output at commit 5cb85515 (main HEAD immediately before the #1055 subtraction). A deliberate,
// intentional render change (a real behavior change to one of the five generators, not a
// refactor) regenerates it with --write-baseline IN THE SAME COMMIT as that change, so the
// fixture and the render it pins never drift apart in history. The baseline is NEVER
// regenerated to make a red assertion pass — a red run here means either an unintended render
// drift (fix the generator) or a genuine intentional change that was not paired with a
// --write-baseline recapture in its own commit (pair them, do not launder the red away).
//
// Usage:
//   node scripts/test-issue-1055-render-subtraction-oracle.js                   run the oracle
//   node scripts/test-issue-1055-render-subtraction-oracle.js --write-baseline  (re)capture it
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(REPO, 'scripts', 'fixtures', 'issue-1055-render-baseline.json');

// #1101: every edition is native-only and contributes command renders only.
const COMMAND_RUNTIMES = ['grok', 'kimi', 'cursor', 'opencode', 'zcode'];
const RUNTIMES = COMMAND_RUNTIMES;

const forgeLayout = require('./runtime-edition-forge.js');

const FORGES = [...forgeLayout.FORGES].sort();

const MODULES = {};
for (const runtime of RUNTIMES) {
  MODULES[runtime] = require('./sync-' + runtime + '-edition.js');
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// renderCommand's argument order is NOT uniform: opencode's is
// (canonContent, forge, label) while grok/kimi/cursor are (canonContent, commandName, forge),
// and zcode (#1079) renders a skill as (canonContent, skillName, forge) — the command→skill
// basename mapping comes from the generator itself.
function renderCommandFor(runtime, canonContent, commandName, forge) {
  const mod = MODULES[runtime];
  if (runtime === 'opencode') {
    const label = mod.treeLabel(forge) + '/commands/' + commandName + '.md';
    return mod.renderCommand(canonContent, forge, label);
  }
  if (runtime === 'zcode') {
    return mod.renderSkill(canonContent, mod.skillNameForCommandBase(commandName), forge);
  }
  return mod.renderCommand(canonContent, commandName, forge);
}

function commandsFor(forge) {
  return [...forgeLayout.commandSources(forge)].sort((a, b) => a.basename.localeCompare(b.basename));
}

function recordKey(rec) {
  return [rec.runtime, rec.forge, rec.kind, rec.name, rec.lineEnding].join(' ');
}

// Deterministic 90-record manifest: 5 runtimes x 3 forges x 3 commands x 2 line-ending variants.
function buildManifest() {
  const records = [];
  for (const runtime of COMMAND_RUNTIMES) {
    for (const forge of FORGES) {
      for (const src of commandsFor(forge)) {
        const commandName = src.basename.slice(0, -3);
        const rawContent = fs.readFileSync(src.absPath, 'utf8');
        const lfContent = rawContent.replace(/\r\n/g, '\n');
        const crlfContent = lfContent.replace(/\n/g, '\r\n');
        for (const variant of [['LF', lfContent], ['CRLF', crlfContent]]) {
          const lineEnding = variant[0];
          const canonContent = variant[1];
          const content = renderCommandFor(runtime, canonContent, commandName, forge);
          records.push({ runtime, forge, kind: 'command', name: commandName, lineEnding, hash: sha256(content) });
        }
      }
    }
  }
  records.sort((a, b) => {
    const ak = recordKey(a);
    const bk = recordKey(b);
    return ak < bk ? -1 : (ak > bk ? 1 : 0);
  });
  return records;
}

function currentCommit() {
  try {
    // spawn-class: environment
    return execSync('git rev-parse HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

const EXPECTED_TOTAL = COMMAND_RUNTIMES.length * FORGES.length * 3 /* commands */ * 2 /* line-ending variants */;

const argv = process.argv.slice(2);

if (argv.includes('--write-baseline')) {
  const records = buildManifest();
  const manifest = {
    tool: 'kaola-workflow-issue-1055-render-subtraction-oracle',
    schema: 1,
    captured_at_commit: currentCommit(),
    runtimes: RUNTIMES,
    forges: FORGES,
    commands: [...new Set(records.filter(r => r.kind === 'command').map(r => r.name))].sort(),
    total_comparisons: records.length,
    records,
  };
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log('wrote baseline manifest: ' + BASELINE_PATH + ' (' + records.length + ' record(s), commit '
    + manifest.captured_at_commit + ')');
  process.exit(0);
}

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

assert(EXPECTED_TOTAL === 90,
  'ORACLE: the spec-derived expected count must be exactly 90 (5 runtimes x 3 forges x 3 commands '
  + 'x 2 line-ending variants) — got ' + EXPECTED_TOTAL + '. COMMAND_RUNTIMES='
  + COMMAND_RUNTIMES.length + ' FORGES=' + FORGES.length);

// Native-only (#1101): no edition renders a Kaola role profile, so none exports renderAgent.
for (const runtime of RUNTIMES) {
  assert(!Object.prototype.hasOwnProperty.call(MODULES[runtime], 'renderAgent'),
    'NATIVE-ONLY: sync-' + runtime + '-edition.js must not export renderAgent — Kaola-Workflow '
    + 'renders no subagent role profile for any runtime');
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error('FATAL: baseline manifest missing at ' + BASELINE_PATH
    + ' — run with --write-baseline once on a known-good commit to capture it.');
  console.error('\nissue-1055-render-subtraction-oracle FAILED: ' + (failed + 1) + ' failure(s), '
    + passed + ' passed.');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const current = buildManifest();

assert(current.length === 90,
  'ORACLE: exactly 90 render comparisons expected — got ' + current.length + '. A silently '
  + 'skipped runtime, forge, or command would change this count.');
assert(current.every(rec => rec.kind === 'command'),
  'NATIVE-ONLY: every render comparison must be a command render — no agent profile render survives');
assert(baseline.total_comparisons === 90,
  'ORACLE: baseline manifest itself must record 90 comparisons — got ' + baseline.total_comparisons);
assert(Array.isArray(baseline.records) && baseline.records.length === 90,
  'ORACLE: baseline manifest must carry exactly 90 record(s) — got '
  + (Array.isArray(baseline.records) ? baseline.records.length : typeof baseline.records));

const baselineByKey = new Map();
for (const rec of baseline.records || []) {
  baselineByKey.set(recordKey(rec), rec.hash);
}

let firstMismatch = null;
let mismatchCount = 0;
for (const rec of current) {
  const key = recordKey(rec);
  const baselineHash = baselineByKey.get(key);
  const label = rec.runtime + '/' + rec.forge + '/' + rec.kind + '/' + rec.name
    + ' (' + rec.lineEnding + ')';
  if (baselineHash === undefined) {
    mismatchCount++;
    if (!firstMismatch) firstMismatch = 'MISSING FROM BASELINE: ' + label;
    continue;
  }
  if (baselineHash !== rec.hash) {
    mismatchCount++;
    if (!firstMismatch) {
      firstMismatch = label + ' — baseline hash ' + baselineHash + ' != current hash ' + rec.hash;
    }
  }
}
assert(mismatchCount === 0,
  'ORACLE: ' + mismatchCount + ' render(s) drifted from the ' + baseline.captured_at_commit
  + ' baseline. First differing artifact: ' + (firstMismatch || '(none)'));

if (failed) {
  console.error('\nissue-1055-render-subtraction-oracle FAILED: ' + failed + ' failure(s), '
    + passed + ' passed.');
  process.exit(1);
}
console.log('issue-1055-render-subtraction-oracle passed (' + passed + ' assertions, '
  + current.length + ' render comparisons hashed against baseline commit '
  + baseline.captured_at_commit + ').');
