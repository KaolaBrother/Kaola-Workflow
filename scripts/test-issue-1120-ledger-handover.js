#!/usr/bin/env node
'use strict';

// issue #1120 — the owner-approved blocked-line hand-over amendment.
//
// Contract under test:
//   source    templates/global/kaola-workflow-global.md carries, once, the verbatim sentence:
//             "A `blocked` line may get one more write before finalize: the hand-over to an open
//              issue (`handed-over: #M`). A `done` or `failed` line is immutable."
//   carriers  every runtime rule carrier renders it from that one source: claude, codex, cursor,
//             grok, opencode, kimi, zcode, devin, droid, dsh (including the repo-tracked compact
//             recovery hooks for claude/codex).
//   shape     at most one well-formed `handed-over: #M` in `details`, and only on a `blocked` line.
//   writer    a blocked line gets exactly ONE more write to add/update that token; a done/failed
//             line, a blocked line that already recorded its hand-over, and removal of a terminal
//             line stay hard-refused. Recoverable changes (blocked returning to in-flight after a
//             ruling) warn and proceed, never hard-block.
//   finalize  accepts the ledger it was handed: a blocked line with its hand-over is a legitimate
//             terminal; a blocked line without one is reported, not refused; archive moves the
//             bytes unchanged.
//
// All four claim editions are exercised for the writer and the finalize `--check` boundary.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

const REPO = path.resolve(__dirname, '..');
const GLOBAL = path.join(REPO, 'templates', 'global', 'kaola-workflow-global.md');
const REGISTRY = path.join(REPO, 'templates', 'global', 'runtime-contract-adapters.json');
const EDITIONS = {
  canonical: { dir: path.join(REPO, 'scripts'), claim: 'kaola-workflow-claim.js' },
  codex: { dir: path.join(REPO, 'plugins/kaola-workflow/scripts'), claim: 'kaola-workflow-claim.js' },
  gitlab: { dir: path.join(REPO, 'plugins/kaola-workflow-gitlab/scripts'), claim: 'kaola-gitlab-workflow-claim.js' },
  gitea: { dir: path.join(REPO, 'plugins/kaola-workflow-gitea/scripts'), claim: 'kaola-gitea-workflow-claim.js' },
};
const RUNTIMES = ['claude', 'codex', 'cursor', 'grok', 'opencode', 'kimi', 'zcode', 'devin', 'droid', 'dsh'];
const SENTENCE = 'A `blocked` line may get one more write before finalize: the hand-over to an open '
  + 'issue (`handed-over: #M`). A `done` or `failed` line is immutable.';

let passed = 0;
let failed = 0;
function check(value, message) {
  if (value) { passed += 1; return; }
  failed += 1;
  console.error('FAIL: ' + message);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function norm(text) { return String(text).replace(/\s+/g, ' ').trim(); }
function occurrences(text, needle) { return norm(text).split(norm(needle)).length - 1; }
function throws(fn, pattern, message) {
  let error = null;
  try { fn(); } catch (e) { error = e; }
  check(error !== null, message + ' (no error thrown)');
  if (error) check(pattern.test(String(error.message || error)), message + ' (wrong error: ' + error.message + ')');
}
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }

function fixtureRepo(tmp, name) {
  const root = path.join(tmp, name);
  fs.mkdirSync(root, { recursive: true });
  G.init(root, { branch: 'main' });
  write(path.join(root, 'README.md'), 'fixture\n');
  write(path.join(root, '.gitignore'), 'kaola-workflow/.ledger/\n.kw/\n');
  G.git(root, ['config', 'user.email', 'fixture@example.invalid']);
  G.git(root, ['config', 'user.name', 'fixture']);
  G.git(root, ['add', '.']);
  G.gitOk(root, ['commit', '-m', 'init']);
  return root;
}

function runCli(ed, args, cwd) {
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [path.join(ed.dir, ed.claim), ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
  });
  const lines = String(result.stdout || '').trim().split('\n').filter(line => line.trim().startsWith('{'));
  let json = null;
  try { json = JSON.parse(lines[lines.length - 1]); } catch (_) { /* leave null */ }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr };
}

// ---------- 1. the canonical source and every runtime carrier ----------
(function sourceAndCarriers() {
  const source = read(GLOBAL);
  check(occurrences(source, SENTENCE) === 1,
    'source: the verbatim owner sentence appears exactly once in templates/global/kaola-workflow-global.md');
  check(norm(source).includes(norm('including where the output will land; then set the terminal status and add where the outcome landed. '
    + SENTENCE + ' One dispatch has one result, including `failed` or `blocked`.')),
  'source: the sentence lands inside the three-write-moments bullet, after the outcome locator and before the terminal-immutability sentence');

  const manifest = require('../templates/routing/required-blocks.js');
  const ledgerBlock = manifest.GLOBAL_CONTRACT_BLOCKS.find(block => block.block_id === 'global-mission-ledger');
  check(!!ledgerBlock, 'manifest: global-mission-ledger block exists');
  if (ledgerBlock) {
    check(ledgerBlock.content_tokens.some(token => norm(token) === norm(SENTENCE)),
      'manifest: the hand-over sentence is a required global-contract token');
  }

  const registry = JSON.parse(read(REGISTRY));
  const families = Array.from(new Set(registry.targets.map(target => target.runtime))).sort();
  check(JSON.stringify(families) === JSON.stringify([...RUNTIMES].sort()),
    'carriers: the registry covers exactly the ten owner-named runtime families, got ' + JSON.stringify(families));
  const contract = require('./kaola-workflow-global-contract.js');
  for (const target of registry.targets) {
    const rendered = contract.renderContract({ source, target, nonce: '' }).toString('utf8');
    check(occurrences(rendered, SENTENCE) === 1,
      'carrier[' + target.id + ']: rendered contract carries the hand-over sentence exactly once');
  }

  const generator = require('./generate-routing-surfaces.js');
  for (const row of generator.RUNTIME_RECOVERY_SURFACES) {
    const file = path.join(REPO, row.path);
    check(fs.existsSync(file), 'carrier[' + row.runtime + '/' + row.forge + ']: compact recovery render exists at ' + row.path);
    if (!fs.existsSync(file)) continue;
    const committed = read(file);
    check(occurrences(committed, SENTENCE) === 1,
      'carrier[' + row.runtime + '/' + row.forge + ']: committed compact recovery render carries the sentence exactly once');
    check(committed === generator.renderCompactRecoveryPrompt(row.runtime, row.forge),
      'carrier[' + row.runtime + '/' + row.forge + ']: committed compact recovery render byte-matches the generator');
  }
})();

// ---------- 2. validator: shape and the one hand-over token ----------
(function validator() {
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const base = [
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'failed lane', details: 'result: failed', status: 'failed' },
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
    { name: 'todo lane', details: '', status: 'todo' },
  ];
  const baseText = schema.serializeLedger(base);
  check(schema.validateLedger(baseText).ok,
    'validator: a ledger with done/failed/blocked/in-flight/todo validates');
  const withHandover = schema.serializeLedger([
    base[0], base[1],
    { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'blocked' },
    base[3], base[4],
  ]);
  check(schema.validateLedger(withHandover).ok,
    'validator: one handed-over: #77 on a blocked line validates');
  const decoded = schema.ledgerHandovers('result: blocked | handed-over: #77');
  check(decoded.total === 1 && decoded.valid === 1 && decoded.issues[0] === 77,
    'validator: ledgerHandovers decodes one positive issue number, got ' + JSON.stringify(decoded));

  const invalid = {
    'hand-over on done': [{ name: 'x', details: 'result: done | handed-over: #7', status: 'done' }],
    'hand-over on failed': [{ name: 'x', details: 'result: failed | handed-over: #7', status: 'failed' }],
    'hand-over on in-flight': [{ name: 'x', details: 'dispatched: self | handed-over: #7', status: 'in-flight' }],
    'hand-over without a number': [{ name: 'x', details: 'result: blocked | handed-over: #M', status: 'blocked' }],
    'hand-over without a hash': [{ name: 'x', details: 'result: blocked | handed-over: 7', status: 'blocked' }],
    'hand-over zero': [{ name: 'x', details: 'result: blocked | handed-over: #0', status: 'blocked' }],
    'two hand-overs': [{ name: 'x', details: 'handed-over: #7 | handed-over: #8', status: 'blocked' }],
  };
  for (const [label, rows] of Object.entries(invalid)) {
    check(!schema.validateLedger(schema.serializeLedger(rows)).ok,
      'validator: rejects ' + label);
  }
  check(schema.validateLedger(schema.serializeLedger([
    { name: 'a', details: 'blocked | handed-over: #7', status: 'blocked' },
    { name: 'b', details: 'blocked | handed-over: #8', status: 'blocked' },
  ])).ok, 'validator: one hand-over per blocked line is legal on more than one line');
  check(!schema.validateLedger(schema.serializeLedger([
    { name: 'closed target', details: 'blocked | handed-over: #7', status: 'blocked' },
  ]).replace('handed-over: #7', 'handed-over: owner said later')).ok,
  'validator: a malformed hand-over token is refused rather than read as prose');
})();

// ---------- 3. the transition rule, pure ----------
(function transition() {
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const base = schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]);
  const handover = schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]);
  let verdict = schema.validateLedgerTransition(base, handover);
  check(verdict.ok && verdict.errors.length === 0,
    'transition: the one hand-over write on a blocked line is allowed');
  verdict = schema.validateLedgerTransition(handover, handover);
  check(verdict.ok, 'transition: rewriting identical bytes (an idempotent write) is allowed');
  verdict = schema.validateLedgerTransition(handover, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked | handed-over: #78', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(!verdict.ok && /already recorded/.test(verdict.errors.join(' ')),
    'transition: a second hand-over rewrite of a blocked line is refused');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: changed', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(!verdict.ok && /immutable/.test(verdict.errors.join(' ')),
    'transition: a done line rewrite is refused');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked', status: 'in-flight' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(verdict.ok && /blocked line changed without a handed-over/.test(verdict.warnings.join(' ')),
    'transition: blocked returning to in-flight after a ruling warns and proceeds (recoverable)');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]));
  check(!verdict.ok && /(may not be removed|already recorded)/.test(verdict.errors.join(' ')),
    'transition: removing a terminal line (and thus renumbering) is refused');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
    { name: 'new lane', details: '', status: 'todo' },
  ]));
  check(verdict.ok, 'transition: appending a new mission is allowed');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'renamed while handing over', details: 'result: blocked | handed-over: #77', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(!verdict.ok && /rename/.test(verdict.errors.join(' ')),
    'transition: the hand-over write may not rename the mission');
})();

// ---------- 4. the reference writer, all four editions ----------
(function writer() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1120-writer-'));
  try {
    for (const [edition, ed] of Object.entries(EDITIONS)) {
      const claim = require(path.join(ed.dir, ed.claim));
      const dir = path.join(tmp, edition);
      const file = path.join(dir, 'issue-9.jsonl');
      const base = [
        { name: 'done lane', details: 'result: pull request', status: 'done' },
        { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
      ];
      claim.writeMissionLedger(file, base);
      claim.writeMissionLedger(file, [
        base[0],
        { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'blocked' },
      ]);
      const handedOverBytes = fs.readFileSync(file);
      check(/handed-over: #77/.test(handedOverBytes.toString('utf8')),
        'writer[' + edition + ']: the blocked line accepts its one hand-over write');
      throws(() => claim.writeMissionLedger(file, [
        { name: 'done lane', details: 'result: changed', status: 'done' },
        base[1],
      ]), /immutable/, 'writer[' + edition + ']: refuses a done-line rewrite');
      check(fs.readFileSync(file).equals(handedOverBytes),
        'writer[' + edition + ']: a refused done rewrite leaves the bytes untouched');
      throws(() => claim.writeMissionLedger(file, [
        base[0],
        { name: 'blocked lane', details: 'result: blocked | handed-over: #78', status: 'blocked' },
      ]), /already recorded|terminal/, 'writer[' + edition + ']: refuses a second hand-over rewrite');
      check(fs.readFileSync(file).equals(handedOverBytes),
        'writer[' + edition + ']: a refused second hand-over leaves the bytes untouched');
      throws(() => claim.writeMissionLedger(file, [base[0]]),
        /may not be removed|already recorded/, 'writer[' + edition + ']: refuses removal of a terminal line');
      check(fs.readFileSync(file).equals(handedOverBytes),
        'writer[' + edition + ']: a refused removal leaves the bytes untouched');

      const recoverable = path.join(dir, 'recoverable.jsonl');
      claim.writeMissionLedger(recoverable, [{ name: 'blocked lane', details: 'result: blocked', status: 'blocked' }]);
      const originalWrite = process.stderr.write;
      let warnings = '';
      process.stderr.write = chunk => { warnings += String(chunk); return true; };
      try {
        claim.writeMissionLedger(recoverable, [{ name: 'blocked lane', details: 'result: blocked', status: 'in-flight' }]);
      } finally {
        process.stderr.write = originalWrite;
      }
      check(/mission ledger warning: .*blocked line changed without a handed-over/.test(warnings),
        'writer[' + edition + ']: a recoverable blocked -> in-flight change warns');
      check(/"status":"in-flight"/.test(read(recoverable)),
        'writer[' + edition + ']: the warned recoverable change still proceeds');

      const rename = path.join(dir, 'rename.jsonl');
      claim.writeMissionLedger(rename, [{ name: 'blocked lane', details: 'result: blocked', status: 'blocked' }]);
      const renameBytes = fs.readFileSync(rename);
      throws(() => claim.writeMissionLedger(rename, [
        { name: 'renamed lane', details: 'result: blocked | handed-over: #77', status: 'blocked' },
      ]), /rename/, 'writer[' + edition + ']: the hand-over write may not rename the mission');
      check(fs.readFileSync(rename).equals(renameBytes),
        'writer[' + edition + ']: a refused rename leaves the bytes untouched');
      check(!fs.readdirSync(dir).some(name => /\.tmp$/.test(name)),
        'writer[' + edition + ']: no temp file is left behind after refusals');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

// ---------- 5. finalize accepts the ledger it was handed; archive preserves it ----------
(function finalizeBoundary() {
  const schema = require('./kaola-workflow-adaptive-schema.js');
  check(schema.validateLedgerFinalize(schema.serializeLedger([
    { name: 'a', details: 'result: done', status: 'done' },
  ])).state === 'complete', 'finalize: a complete ledger reports complete');
  const handed = schema.serializeLedger([
    { name: 'a', details: 'result: blocked | handed-over: #77', status: 'blocked' },
  ]);
  let verdict = schema.validateLedgerFinalize(handed);
  check(verdict.ok && verdict.state === 'handed_over'
    && verdict.handovers.length === 1 && verdict.handovers[0].issue === 77,
  'finalize: a blocked line with its hand-over reports handed_over');
  verdict = schema.validateLedgerFinalize(schema.serializeLedger([
    { name: 'a', details: 'result: blocked', status: 'blocked' },
  ]));
  check(verdict.ok && verdict.state === 'blocked_without_handover'
    && verdict.warnings.some(warning => warning.code === 'blocked_without_handover'),
  'finalize: a blocked line without a hand-over is reported, not refused');
  verdict = schema.validateLedgerFinalize('not a ledger\n');
  check(verdict.ok && verdict.state === 'invalid'
    && verdict.warnings.some(warning => warning.code === 'mission_ledger_invalid'),
  'finalize: an invalid ledger is reported, not refused');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1120-finalize-'));
  try {
    for (const [edition, ed] of Object.entries(EDITIONS)) {
      const repo = fixtureRepo(tmp, 'repo-' + edition);
      const acquired = runCli(ed, ['claim', '--project', 'issue-1120', '--issue', '1120'], repo);
      check(acquired.json && acquired.json.claim === 'acquired',
        'finalize[' + edition + ']: fixture claim acquires (' + acquired.stderr.trim().split('\n').pop() + ')');
      if (!acquired.json || !acquired.json.claim) continue;
      const claim = require(path.join(ed.dir, ed.claim));
      const ledger = acquired.json.ledger_path;
      claim.writeMissionLedger(ledger, [
        { name: 'lane', details: 'result: blocked', status: 'blocked' },
      ]);
      let checked = runCli(ed, ['finalize', '--project', 'issue-1120', '--check', '--json'], repo);
      check(checked.json && checked.json.checks && checked.json.checks.mission_ledger === 'blocked_without_handover',
        'finalize[' + edition + ']: --check reports blocked_without_handover, got '
        + JSON.stringify(checked.json && checked.json.checks && checked.json.checks.mission_ledger));
      check(checked.json && Array.isArray(checked.json.reasons)
        && !checked.json.reasons.some(reason => /ledger/.test(reason)),
      'finalize[' + edition + ']: a blocked line without a hand-over is not a refusal reason');

      claim.writeMissionLedger(ledger, [
        { name: 'lane', details: 'result: blocked | handed-over: #99', status: 'blocked' },
      ]);
      checked = runCli(ed, ['finalize', '--project', 'issue-1120', '--check', '--json'], repo);
      check(checked.json && checked.json.checks && checked.json.checks.mission_ledger === 'handed_over',
        'finalize[' + edition + ']: --check accepts the one hand-over write as handed_over');
      const before = fs.readFileSync(ledger);
      const dest = path.join(repo, 'kaola-workflow', 'archive', 'issue-1120');
      fs.mkdirSync(dest, { recursive: true });
      const moved = claim.moveMissionLedger(repo, 1120, dest);
      check(moved === 'moved', 'finalize[' + edition + ']: archive moves the handed-over ledger, got ' + moved);
      check(!fs.existsSync(ledger), 'finalize[' + edition + ']: live ledger is gone after the move');
      const archived = path.join(dest, 'mission-ledger.jsonl');
      check(fs.existsSync(archived) && fs.readFileSync(archived).equals(before),
        'finalize[' + edition + ']: archived bytes are byte-identical to the handed-over ledger');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

console.log('issue-1120 ledger hand-over: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
