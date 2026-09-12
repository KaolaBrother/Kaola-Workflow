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
// dead CURSOR_MODEL_CLASS_PINS table + cursorModelPin function (the real renderAgent delegates
// entirely to generate-agent-profiles.renderRuntimeRole). None of that dead code is reachable
// from renderAgent / renderCommand / transformCommandBody's actual output, so a safe
// subtraction must leave every rendered byte identical to before.
//
// This oracle renders every agent and command surface these five modules produce — 2 binding
// runtimes x 3 forges x 7 roles = 42 agent renders, plus 5 runtimes x 3 forges x 3 commands x 2
// line-ending variants (LF, CRLF) = 90 command renders, 132 renders total — hashes each, and
// diffs the hashes against the baseline manifest (recaptured under #1062: the render changed
// when the 14-role catalog became 7 and the native-only editions stopped shipping profiles).
// A hash drift anywhere fails loud with the first differing runtime/forge/artifact; a runtime or
// forge silently skipped from either loop is caught by the asserted 132 count, not merely by an
// emptied diff.
//
// Depends ONLY on the five sync-*-edition.js modules, generate-agent-profiles.js,
// runtime-edition-forge.js, and the tracked commands/*.md canonical sources under templates/
// routing — never on a generated .grok*/.kimi*/.cursor*/.opencode*/.zcode* tree existing on
// disk, so this suite is not vacuous in a fresh worktree and is safe to register on the focused
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

// #1062 split: only the binding runtimes render agent profiles; the native-only editions
// (kimi, opencode, zcode) ship no Kaola role profiles and contribute command renders only.
const AGENT_RUNTIMES = ['grok', 'cursor'];
const COMMAND_RUNTIMES = ['grok', 'kimi', 'cursor', 'opencode', 'zcode'];
const RUNTIMES = COMMAND_RUNTIMES;

const forgeLayout = require('./runtime-edition-forge.js');
const agentGen = require('./generate-agent-profiles.js');

const FORGES = [...forgeLayout.FORGES].sort();
const ROLES = [...agentGen.ROLES].sort();

const MODULES = {};
for (const runtime of RUNTIMES) {
  MODULES[runtime] = require('./sync-' + runtime + '-edition.js');
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// renderAgent(canonContent, role, forge) is uniform across the binding modules and ignores
// canonContent/forge (each delegates to generate-agent-profiles.renderRuntimeRole(runtime,
// role)) — pass through faithfully anyway so a future runtime that DOES consult forge is
// still exercised per-forge, matching the spec's 2 x 3 x 7 count.
function renderAgentFor(runtime, role, forge) {
  return MODULES[runtime].renderAgent('', role, forge);
}

// renderCommand's argument order is NOT uniform: opencode's is
// (canonContent, forge, label) while the other four are (canonContent, commandName, forge).
function renderCommandFor(runtime, canonContent, commandName, forge) {
  const mod = MODULES[runtime];
  if (runtime === 'opencode') {
    const label = mod.treeLabel(forge) + '/commands/' + commandName + '.md';
    return mod.renderCommand(canonContent, forge, label);
  }
  return mod.renderCommand(canonContent, commandName, forge);
}

function commandsFor(forge) {
  return [...forgeLayout.commandSources(forge)].sort((a, b) => a.basename.localeCompare(b.basename));
}

function recordKey(rec) {
  return [rec.runtime, rec.forge, rec.kind, rec.name, rec.lineEnding].join(' ');
}

// Deterministic 132-record manifest: 2 runtimes x 3 forges x 7 roles (agent, lineEnding
// "n/a") + 5 runtimes x 3 forges x 3 commands x 2 line-ending variants (command).
function buildManifest() {
  const records = [];
  for (const runtime of AGENT_RUNTIMES) {
    for (const forge of FORGES) {
      for (const role of ROLES) {
        const content = renderAgentFor(runtime, role, forge);
        records.push({ runtime, forge, kind: 'agent', name: role, lineEnding: 'n/a', hash: sha256(content) });
      }
    }
  }
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

const EXPECTED_TOTAL = AGENT_RUNTIMES.length * FORGES.length * ROLES.length
  + COMMAND_RUNTIMES.length * FORGES.length * 3 /* commands */ * 2 /* line-ending variants */;

const argv = process.argv.slice(2);

if (argv.includes('--write-baseline')) {
  const records = buildManifest();
  const manifest = {
    tool: 'kaola-workflow-issue-1055-render-subtraction-oracle',
    schema: 1,
    captured_at_commit: currentCommit(),
    runtimes: RUNTIMES,
    agent_runtimes: AGENT_RUNTIMES,
    forges: FORGES,
    roles: ROLES,
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

assert(EXPECTED_TOTAL === 132,
  'ORACLE: the spec-derived expected count must be exactly 132 (2 runtimes x 3 forges x 7 roles '
  + '= 42, plus 5 runtimes x 3 forges x 3 commands x 2 line-ending variants = 90) — got '
  + EXPECTED_TOTAL + '. AGENT_RUNTIMES=' + AGENT_RUNTIMES.length + ' COMMAND_RUNTIMES='
  + COMMAND_RUNTIMES.length + ' FORGES=' + FORGES.length + ' ROLES=' + ROLES.length);

if (!fs.existsSync(BASELINE_PATH)) {
  console.error('FATAL: baseline manifest missing at ' + BASELINE_PATH
    + ' — run with --write-baseline once on a known-good commit to capture it.');
  console.error('\nissue-1055-render-subtraction-oracle FAILED: ' + (failed + 1) + ' failure(s), '
    + passed + ' passed.');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const current = buildManifest();

assert(current.length === 132,
  'ORACLE: exactly 132 render comparisons expected — got ' + current.length + '. A silently '
  + 'skipped runtime, forge, role, or command would change this count.');
assert(baseline.total_comparisons === 132,
  'ORACLE: baseline manifest itself must record 132 comparisons — got ' + baseline.total_comparisons);
assert(Array.isArray(baseline.records) && baseline.records.length === 132,
  'ORACLE: baseline manifest must carry exactly 132 record(s) — got '
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
    + (rec.lineEnding !== 'n/a' ? ' (' + rec.lineEnding + ')' : '');
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
