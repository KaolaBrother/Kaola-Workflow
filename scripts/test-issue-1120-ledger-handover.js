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
function captureStderr(fn) {
  const original = process.stderr.write;
  let text = '';
  process.stderr.write = chunk => { text += String(chunk); return true; };
  let error = null;
  try { fn(); } catch (e) { error = e; }
  finally { process.stderr.write = original; }
  return { error, warnings: text };
}
function findingSection(file, type) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('\n### ' + type + '\n');
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.indexOf('\n### ');
  return next < 0 ? rest : rest.slice(0, next);
}

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
    'hand-over without a number': [{ name: 'x', details: 'result: blocked | handed-over: #M', status: 'blocked' }],
    'hand-over without a hash': [{ name: 'x', details: 'result: blocked | handed-over: 7', status: 'blocked' }],
    'hand-over zero': [{ name: 'x', details: 'result: blocked | handed-over: #0', status: 'blocked' }],
    'hand-over without the sentence space': [{ name: 'x', details: 'result: blocked | handed-over:#7', status: 'blocked' }],
    'hand-over with a trailing suffix': [{ name: 'x', details: 'result: blocked | handed-over: #12abc', status: 'blocked' }],
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
    { name: 'closed target', details: 'blocked | handed-over: owner said later', status: 'blocked' },
  ])).ok, 'validator: a malformed hand-over token on a blocked line is refused rather than read as prose');
  const notToken = schema.validateLedger(schema.serializeLedger([
    { name: 'not a token', details: 'blocked | not-handed-over: #5', status: 'blocked' },
  ]));
  check(notToken.ok && !notToken.warnings.some(warning => /handed-over/.test(warning)),
    'validator: not-handed-over is prose, not a near-miss token');
  for (const status of ['done', 'failed', 'in-flight', 'todo']) {
    const prose = schema.validateLedger(schema.serializeLedger([
      { name: 'historical note', details: 'result: ' + status + ' | handed-over: #7', status },
    ]));
    check(prose.ok && prose.warnings.some(warning => /only meaningful on a blocked line/.test(warning)),
      'validator: hand-over-shaped text on a ' + status + ' line is a warning, not an error');
    const freeText = schema.validateLedger(schema.serializeLedger([
      { name: 'historical note', details: 'handed-over: see notes', status },
    ]));
    check(freeText.ok && freeText.warnings.some(warning => /only meaningful on a blocked line/.test(warning)),
      'validator: free-text handed-over: prose on a ' + status + ' line is a warning, not an error');
  }
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
  for (const [target, label] of [['in-flight', 'in-flight'], ['done', 'done'], ['failed', 'failed']]) {
    verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
      { name: 'done lane', details: 'result: pull request', status: 'done' },
      { name: 'blocked lane', details: 'result: ' + target, status: target },
      { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
    ]));
    check(verdict.ok && /blocked line changed without a handed-over/.test(verdict.warnings.join(' ')),
      'transition: blocked -> ' + label + ' after a ruling warns and proceeds (recoverable)');
  }
  verdict = schema.validateLedgerTransition(handover, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'done' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(!verdict.ok && /already recorded/.test(verdict.errors.join(' ')),
    'transition: a handed-over line changing status is refused');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]), schema.serializeLedger([]));
  check(!verdict.ok && /line 1: a done line may not be removed/.test(verdict.errors.join(' ')),
    'transition: removing a done line is refused with the actual line named');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked', status: 'done' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(verdict.ok, 'transition: a blocked line may reach a terminal done result');
  const blockedOnly = schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
  ]);
  verdict = schema.validateLedgerTransition(blockedOnly, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]));
  check(!verdict.ok && /a blocked mission may not be removed/.test(verdict.errors.join(' ')),
    'transition: removing a blocked line without a hand-over is refused');
  verdict = schema.validateLedgerTransition(handover, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]));
  check(!verdict.ok && /already records its hand-over is terminal and may not be removed/.test(verdict.errors.join(' ')),
    'transition: removing a handed-over blocked line names the terminal hand-over');
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
  check(verdict.ok && /renamed the mission/.test(verdict.warnings.join(' ')),
    'transition: the hand-over write may rename the mission, with a warning');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'in-flight' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(verdict.ok,
    'transition: a blocked line may move to in-flight carrying the hand-over token (prose, warning only)');
  check(schema.validateLedger(schema.serializeLedger([
    { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'in-flight' },
  ])).warnings.some(warning => /only meaningful on a blocked line/.test(warning)),
  'transition: the token on the resulting non-blocked line is a validateLedger warning');
  const tokenResult = schema.serializeLedger([
    { name: 'flow lane', details: 'result: done | handed-over: #5', status: 'done' },
  ]);
  verdict = schema.validateLedgerTransition(
    schema.serializeLedger([{ name: 'flow lane', details: 'dispatched: self', status: 'in-flight' }]),
    tokenResult);
  check(verdict.ok, 'transition: an in-flight -> done result write carrying the token proceeds');
  check(schema.validateLedger(tokenResult).warnings.some(warning => /only meaningful on a blocked line/.test(warning)),
    'transition: the in-flight -> done token is warned as prose on a non-blocked line');
  verdict = schema.validateLedgerTransition(base, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'blocked lane', details: 'handed-over: #77', status: 'blocked' },
    { name: 'flow lane', details: 'dispatched: self', status: 'in-flight' },
  ]));
  check(verdict.ok && /did not preserve the previous details text/.test(verdict.warnings.join(' ')),
    'transition: a hand-over write that drops the previous details text warns');
  verdict = schema.validateLedgerTransition('not a ledger\n', base);
  check(verdict.ok && /previous ledger did not validate/.test(verdict.warnings.join(' ')),
    'transition: an unparseable previous ledger warns and proceeds');
  const beforeMiddle = schema.serializeLedger([
    { name: 'todo lane', details: '', status: 'todo' },
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]);
  verdict = schema.validateLedgerTransition(beforeMiddle, schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]));
  check(!verdict.ok
    && /line 2: a done line would be renumbered to 1/.test(verdict.errors.join(' '))
    && /line 1: a todo mission was removed/.test(verdict.warnings.join(' ')),
  'transition: removing a todo before a done names both the removed line and the renumbered done line');
  const beforeInsert = schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]);
  verdict = schema.validateLedgerTransition(beforeInsert, schema.serializeLedger([
    { name: 'todo lane', details: '', status: 'todo' },
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]));
  check(!verdict.ok && /line 1: a done line would be renumbered to 2/.test(verdict.errors.join(' ')),
    'transition: inserting a todo before a done names the renumbered done line');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
    { name: 'todo lane', details: '', status: 'todo' },
  ]), schema.serializeLedger([
    { name: 'done lane', details: 'result: pull request', status: 'done' },
  ]));
  check(verdict.ok && /line 2: a todo mission was removed/.test(verdict.warnings.join(' ')),
    'transition: removing a trailing todo warns and proceeds');

  // N2: an insertion before a blocked line without a hand-over is a recoverable renumber.
  verdict = schema.validateLedgerTransition(schema.serializeLedger([
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
  ]), schema.serializeLedger([
    { name: 'todo lane', details: '', status: 'todo' },
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
  ]));
  check(verdict.ok
    && /line 1: a blocked mission was renumbered to 2/.test(verdict.warnings.join(' ')),
  'transition: inserting a mission before a blocked line warns and proceeds (not hard-refused)');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([
    { name: 'todo lane', details: '', status: 'todo' },
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
  ]), schema.serializeLedger([
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
  ]));
  check(verdict.ok
    && /line 2: a blocked mission was renumbered to 1/.test(verdict.warnings.join(' ')),
  'transition: removing a mission before a trailing blocked line warns and proceeds (not hard-refused)');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([
    { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
  ]), schema.serializeLedger([]));
  check(!verdict.ok && /a blocked mission may not be removed/.test(verdict.errors.join(' ')),
    'transition: removing the only blocked line (no move target) stays refused');

  // N1: duplicate content must not turn a hand-over or a recoverable transition into a "move".
  const duplicate = { name: 'review', details: 'result: blocked', status: 'blocked' };
  const duplicateBlocked = schema.serializeLedger([duplicate, duplicate]);
  verdict = schema.validateLedgerTransition(duplicateBlocked, schema.serializeLedger([
    { ...duplicate, details: 'result: blocked | handed-over: #5' },
    duplicate,
  ]));
  check(verdict.ok && !/renumbered/.test(verdict.errors.join(' ')),
    'transition[N1]: with two identical blocked lines, handing over the first is allowed');
  verdict = schema.validateLedgerTransition(duplicateBlocked, schema.serializeLedger([
    duplicate,
    { ...duplicate, details: 'result: blocked | handed-over: #6' },
  ]));
  check(verdict.ok && !/renumbered/.test(verdict.errors.join(' ')),
    'transition[N1]: with two identical blocked lines, handing over the second is allowed');
  verdict = schema.validateLedgerTransition(duplicateBlocked, schema.serializeLedger([
    { ...duplicate, status: 'in-flight' },
    duplicate,
  ]));
  check(verdict.ok && /blocked line changed without a handed-over/.test(verdict.warnings.join(' ')),
    'transition[N1]: with two identical blocked lines, blocked -> in-flight warns and proceeds');

  const duplicateDone = { name: 'done lane', details: 'result: pull request', status: 'done' };
  const duplicateDoneText = schema.serializeLedger([duplicateDone, duplicateDone]);
  verdict = schema.validateLedgerTransition(duplicateDoneText, schema.serializeLedger([
    { ...duplicateDone, details: 'result: changed' },
    duplicateDone,
  ]));
  check(!verdict.ok
    && /line 1: a done line is immutable and may not be rewritten/.test(verdict.errors.join(' '))
    && !/renumbered/.test(verdict.errors.join(' ')),
  'transition[N1]: rewriting the first of two identical done lines reports immutable, not a renumber');
  const duplicateFailed = { name: 'failed lane', details: 'result: failed', status: 'failed' };
  verdict = schema.validateLedgerTransition(
    schema.serializeLedger([duplicateFailed, duplicateFailed]),
    schema.serializeLedger([
      duplicateFailed,
      { ...duplicateFailed, details: 'result: changed' },
    ]));
  check(!verdict.ok
    && /line 2: a failed line is immutable and may not be rewritten/.test(verdict.errors.join(' '))
    && !/renumbered/.test(verdict.errors.join(' ')),
  'transition[N1]: rewriting the second of two identical failed lines reports immutable, not a renumber');
  verdict = schema.validateLedgerTransition(duplicateDoneText, schema.serializeLedger([duplicateDone]));
  check(!verdict.ok
    && /line 2: a done line may not be removed/.test(verdict.errors.join(' '))
    && !/renumbered/.test(verdict.errors.join(' ')),
  'transition[N1]: removing one of two identical done lines reports the vanished slot, not a renumber');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([
    { name: 'todo lane', details: '', status: 'todo' },
    duplicateDone,
    duplicateDone,
  ]), schema.serializeLedger([duplicateDone, duplicateDone]));
  check(!verdict.ok
    && /line 2: a done line would be renumbered to 1/.test(verdict.errors.join(' '))
    && /line 3: a done line would be renumbered to 2/.test(verdict.errors.join(' '))
    && !/line 3: a done line would be renumbered to 1/.test(verdict.errors.join(' ')),
  'transition[R3-3]: duplicate done lines report their actual renumbered positions, not a shared first slot');

  // R4-1/R4-2/R4-3: the reviewer's E5-E11 duplicate-content probes.
  const dupDone = { name: 'done lane', details: 'result: pull request', status: 'done' };
  const dupTodo = { name: 'todo lane', details: '', status: 'todo' };
  const dupBlocked = { name: 'blocked lane', details: 'result: blocked', status: 'blocked' };
  const dupHanded = { name: 'handed lane', details: 'result: blocked | handed-over: #5', status: 'blocked' };
  verdict = schema.validateLedgerTransition(schema.serializeLedger([dupDone]),
    schema.serializeLedger([dupDone, dupDone]));
  check(verdict.ok && verdict.errors.length === 0,
    'transition[E5]: appending a byte-identical done line is allowed');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([dupDone, dupTodo]),
    schema.serializeLedger([dupDone, dupDone]));
  check(verdict.ok, 'transition[E6]: replacing a todo with a byte-identical done line proceeds');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([dupDone, dupDone]),
    schema.serializeLedger([dupDone, dupDone, dupDone]));
  check(verdict.ok && verdict.errors.length === 0,
    'transition[E7]: appending a third byte-identical done line is allowed');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([dupBlocked]),
    schema.serializeLedger([dupBlocked, dupBlocked]));
  check(verdict.ok && !/renumbered/.test(verdict.warnings.join(' ')),
    'transition[E8]: appending a byte-identical blocked line adds no spurious renumber warning');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([dupHanded, dupTodo]),
    schema.serializeLedger([dupHanded, dupHanded]));
  check(verdict.ok, 'transition[E9]: replacing a todo with a byte-identical handed-over line proceeds');
  verdict = schema.validateLedgerTransition(schema.serializeLedger([dupBlocked, dupBlocked]),
    schema.serializeLedger([dupBlocked]));
  check(!verdict.ok && /a blocked mission may not be removed/.test(verdict.errors.join(' ')),
    'transition[E10]: removing one of two identical blocked lines is refused when its slot disappears');
  const swapOne = { name: 'done one', details: 'result one', status: 'done' };
  const swapTwo = { name: 'done two', details: 'result two', status: 'done' };
  verdict = schema.validateLedgerTransition(
    schema.serializeLedger([swapOne, swapTwo]),
    schema.serializeLedger([swapTwo, swapOne]));
  check(!verdict.ok
    && /line 1: a done line would be renumbered to 2/.test(verdict.errors.join(' '))
    && /line 2: a done line would be renumbered to 1/.test(verdict.errors.join(' '))
    && !/immutable/.test(verdict.errors.join(' ')),
  'transition[E11]: swapping two done lines names both moves, not an immutable rewrite');
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
        /already records its hand-over is terminal and may not be removed/,
        'writer[' + edition + ']: refuses removal of a handed-over line with the exact terminal reason');
      check(fs.readFileSync(file).equals(handedOverBytes),
        'writer[' + edition + ']: a refused removal leaves the bytes untouched');

      const blockedNoHandover = path.join(dir, 'blocked-no-handover.jsonl');
      claim.writeMissionLedger(blockedNoHandover, [{ name: 'blocked lane', details: 'result: blocked', status: 'blocked' }]);
      throws(() => claim.writeMissionLedger(blockedNoHandover, []),
        /line 1: a blocked mission may not be removed/,
        'writer[' + edition + ']: refuses removal of a blocked line without a hand-over');
      const shiftedBlocked = path.join(dir, 'shifted-blocked.jsonl');
      claim.writeMissionLedger(shiftedBlocked, [
        { name: 'todo lane', details: '', status: 'todo' },
        { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
      ]);
      const shiftedCapture = captureStderr(() => claim.writeMissionLedger(shiftedBlocked, [
        { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
      ]));
      check(!shiftedCapture.error
        && /mission ledger warning: .*line 2: a blocked mission was renumbered to 1/.test(shiftedCapture.warnings),
      'writer[' + edition + ']: removing a mission before a trailing blocked line warns and proceeds');
      check(/"n":1,"name":"blocked lane"/.test(read(shiftedBlocked)),
        'writer[' + edition + ']: the shifted blocked line is written at its new position');

      const recoverable = path.join(dir, 'recoverable.jsonl');
      claim.writeMissionLedger(recoverable, [{ name: 'blocked lane', details: 'result: blocked', status: 'blocked' }]);
      let captured = captureStderr(() => claim.writeMissionLedger(recoverable,
        [{ name: 'blocked lane', details: 'result: blocked', status: 'in-flight' }]));
      check(!captured.error
        && /mission ledger warning: .*blocked line changed without a handed-over/.test(captured.warnings),
      'writer[' + edition + ']: a recoverable blocked -> in-flight change warns');
      check(/"status":"in-flight"/.test(read(recoverable)),
        'writer[' + edition + ']: the warned blocked -> in-flight change still proceeds');
      for (const target of ['done', 'failed']) {
        const terminal = path.join(dir, 'recoverable-' + target + '.jsonl');
        claim.writeMissionLedger(terminal, [{ name: 'blocked lane', details: 'result: blocked', status: 'blocked' }]);
        captured = captureStderr(() => claim.writeMissionLedger(terminal,
          [{ name: 'blocked lane', details: 'result: ' + target, status: target }]));
        check(!captured.error
          && /mission ledger warning: .*blocked line changed without a handed-over/.test(captured.warnings),
        'writer[' + edition + ']: a recoverable blocked -> ' + target + ' change warns');
        check(JSON.parse(read(terminal)).status === target,
          'writer[' + edition + ']: the warned blocked -> ' + target + ' change still proceeds');
      }
      const tokenTransition = path.join(dir, 'token-transition.jsonl');
      claim.writeMissionLedger(tokenTransition, [
        { name: 'blocked lane', details: 'result: blocked', status: 'blocked' },
      ]);
      captured = captureStderr(() => claim.writeMissionLedger(tokenTransition, [
        { name: 'blocked lane', details: 'result: blocked | handed-over: #5', status: 'in-flight' },
      ]));
      check(!captured.error
        && /mission ledger warning: .*only meaningful on a blocked line/.test(captured.warnings),
      'writer[' + edition + ']: a blocked -> in-flight write carrying the token warns instead of refusing');
      check(/"status":"in-flight"/.test(read(tokenTransition))
        && /handed-over: #5/.test(read(tokenTransition)),
      'writer[' + edition + ']: the warned token-bearing non-blocked write proceeds');

      const invalidPrevious = path.join(dir, 'invalid-previous.jsonl');
      write(invalidPrevious, '{not json}\n');
      captured = captureStderr(() => claim.writeMissionLedger(invalidPrevious,
        [{ name: 'repaired lane', details: '', status: 'todo' }]));
      check(!captured.error
        && /mission ledger warning: .*previous ledger did not validate/.test(captured.warnings),
      'writer[' + edition + ']: an unparseable previous ledger warns and the repair write proceeds');
      check(/"name":"repaired lane"/.test(read(invalidPrevious)),
        'writer[' + edition + ']: the repaired ledger is written over the unparseable bytes');

      const prose = path.join(dir, 'done-prose.jsonl');
      captured = captureStderr(() => claim.writeMissionLedger(prose,
        [{ name: 'done lane', details: 'result: done | handed-over: see notes', status: 'done' }]));
      check(!captured.error
        && /mission ledger warning: .*only meaningful on a blocked line/.test(captured.warnings),
      'writer[' + edition + ']: hand-over-shaped prose on a done line warns instead of crashing');
      check(/handed-over: see notes/.test(read(prose)),
        'writer[' + edition + ']: the prose line is written unchanged');
      captured = captureStderr(() => claim.writeMissionLedger(prose,
        [{ name: 'done lane', details: 'result: done | handed-over: see notes', status: 'done' }]));
      check(!captured.error
        && /mission ledger warning: .*only meaningful on a blocked line/.test(captured.warnings),
      'writer[' + edition + ']: an idempotent write over done prose still warns and proceeds');

      const drop = path.join(dir, 'drop-details.jsonl');
      claim.writeMissionLedger(drop, [{ name: 'blocked lane', details: 'result: blocked | notes', status: 'blocked' }]);
      captured = captureStderr(() => claim.writeMissionLedger(drop,
        [{ name: 'blocked lane', details: 'handed-over: #77', status: 'blocked' }]));
      check(!captured.error
        && /mission ledger warning: .*did not preserve the previous details text/.test(captured.warnings),
      'writer[' + edition + ']: a hand-over write that drops the previous details text warns');
      check(/handed-over: #77/.test(read(drop)),
        'writer[' + edition + ']: the warned hand-over write still proceeds');

      const handedStatus = path.join(dir, 'handed-status.jsonl');
      claim.writeMissionLedger(handedStatus, [
        { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'blocked' },
      ]);
      const handedStatusBytes = fs.readFileSync(handedStatus);
      throws(() => claim.writeMissionLedger(handedStatus, [
        { name: 'blocked lane', details: 'result: blocked | handed-over: #77', status: 'done' },
      ]), /already recorded/, 'writer[' + edition + ']: refuses a handed-over line changing status');
      check(fs.readFileSync(handedStatus).equals(handedStatusBytes),
        'writer[' + edition + ']: a refused handed-over status change leaves the bytes untouched');

      const rename = path.join(dir, 'rename.jsonl');
      claim.writeMissionLedger(rename, [{ name: 'blocked lane', details: 'result: blocked', status: 'blocked' }]);
      captured = captureStderr(() => claim.writeMissionLedger(rename, [
        { name: 'renamed lane', details: 'result: blocked | handed-over: #77', status: 'blocked' },
      ]));
      check(!captured.error
        && /mission ledger warning: .*renamed the mission/.test(captured.warnings),
      'writer[' + edition + ']: the hand-over write may rename the mission, with a warning');
      check(/"name":"renamed lane"/.test(read(rename)),
        'writer[' + edition + ']: the warned rename is written');

      // N1: two identical blocked lines must each be able to take their own hand-over write.
      const duplicateBlocked = { name: 'review', details: 'result: blocked', status: 'blocked' };
      const duplicateFirst = path.join(dir, 'duplicate-first.jsonl');
      claim.writeMissionLedger(duplicateFirst, [duplicateBlocked, duplicateBlocked]);
      captured = captureStderr(() => claim.writeMissionLedger(duplicateFirst, [
        { ...duplicateBlocked, details: 'result: blocked | handed-over: #5' },
        duplicateBlocked,
      ]));
      check(!captured.error,
        'writer[' + edition + '][N1]: the first of two identical blocked lines accepts its hand-over');
      check(/handed-over: #5/.test(read(duplicateFirst)),
        'writer[' + edition + '][N1]: the first duplicate hand-over is written');
      const duplicateSecond = path.join(dir, 'duplicate-second.jsonl');
      claim.writeMissionLedger(duplicateSecond, [duplicateBlocked, duplicateBlocked]);
      captured = captureStderr(() => claim.writeMissionLedger(duplicateSecond, [
        duplicateBlocked,
        { ...duplicateBlocked, details: 'result: blocked | handed-over: #6' },
      ]));
      check(!captured.error,
        'writer[' + edition + '][N1]: the second of two identical blocked lines accepts its hand-over');
      check(/handed-over: #6/.test(read(duplicateSecond)),
        'writer[' + edition + '][N1]: the second duplicate hand-over is written');
      const duplicateFlow = path.join(dir, 'duplicate-flow.jsonl');
      claim.writeMissionLedger(duplicateFlow, [duplicateBlocked, duplicateBlocked]);
      captured = captureStderr(() => claim.writeMissionLedger(duplicateFlow, [
        { ...duplicateBlocked, status: 'in-flight' },
        duplicateBlocked,
      ]));
      check(!captured.error && /blocked line changed without a handed-over/.test(captured.warnings),
        'writer[' + edition + '][N1]: a duplicate blocked -> in-flight change warns and proceeds');
      const appendDone = path.join(dir, 'append-done.jsonl');
      const appendingDone = { name: 'done lane', details: 'result: pull request', status: 'done' };
      claim.writeMissionLedger(appendDone, [appendingDone]);
      captured = captureStderr(() => claim.writeMissionLedger(appendDone, [appendingDone, appendingDone]));
      check(!captured.error && !/renumbered/.test(captured.warnings),
        'writer[' + edition + '][E5]: appending a byte-identical done line is allowed');
      check(read(appendDone).trim().split('\n').length === 2,
        'writer[' + edition + '][E5]: both identical done lines are written');
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
      const checked = runCli(ed, ['finalize', '--project', 'issue-1120', '--check', '--json'], repo);
      check(checked.json && checked.json.checks && checked.json.checks.mission_ledger === 'blocked_without_handover',
        'finalize[' + edition + ']: --check reports blocked_without_handover, got '
        + JSON.stringify(checked.json && checked.json.checks && checked.json.checks.mission_ledger));
      check(checked.json && Array.isArray(checked.json.reasons)
        && !checked.json.reasons.some(reason => /ledger/.test(reason)),
      'finalize[' + edition + ']: a blocked line without a hand-over is not a refusal reason');

      // MAJOR 1: drive the REAL finalize transaction, not just --check. The blocked line has no
      // hand-over; finalize must close, carry the state on finalize_transaction, raise the typed
      // finding on the envelope, and write the durable `## Finalize Findings` section.
      const before = fs.readFileSync(ledger);
      const real = runCli(ed, ['finalize', '--project', 'issue-1120', '--json'], repo);
      check(real.status === 0,
        'finalize[' + edition + ']: real finalize with a blocked line and no hand-over exits 0, got '
        + real.status + '\nstdout: ' + real.stdout + '\nstderr: ' + real.stderr);
      check(real.json && real.json.status === 'closed',
        'finalize[' + edition + ']: real finalize still closes the run');
      check(real.json && real.json.finalize_transaction
        && real.json.finalize_transaction.mission_ledger === 'blocked_without_handover',
      'finalize[' + edition + ']: finalize_transaction.mission_ledger is blocked_without_handover');
      check(real.json && real.json.finalize_transaction
        && real.json.finalize_transaction.findings.includes('blocked_without_handover'),
      'finalize[' + edition + ']: the blocked_without_handover finding reaches the envelope');
      const summary = path.join(repo, 'kaola-workflow', 'archive', 'issue-1120', 'finalization-summary.md');
      check(findingSection(summary, 'blocked_without_handover') !== null,
        'finalize[' + edition + ']: the durable ## Finalize Findings section names blocked_without_handover');
      const archived = path.join(repo, 'kaola-workflow', 'archive', 'issue-1120', 'mission-ledger.jsonl');
      check(!fs.existsSync(ledger), 'finalize[' + edition + ']: real finalize moved the live ledger');
      check(fs.existsSync(archived) && fs.readFileSync(archived).equals(before),
        'finalize[' + edition + ']: the archived ledger is byte-identical to the pre-finalize bytes');
    }

    // The accepted hand-over shape, per edition: real finalize reports handed_over and raises no
    // blocked_without_handover finding.
    for (const [edition, ed] of Object.entries(EDITIONS)) {
      const repo = fixtureRepo(tmp, 'repo-handed-over-' + edition);
      const acquired = runCli(ed, ['claim', '--project', 'issue-1120', '--issue', '1120'], repo);
      check(acquired.json && acquired.json.claim === 'acquired',
        'finalize[handed-over/' + edition + ']: fixture claim acquires');
      if (!acquired.json || !acquired.json.claim) continue;
      const claim = require(path.join(ed.dir, ed.claim));
      const ledger = acquired.json.ledger_path;
      claim.writeMissionLedger(ledger, [
        { name: 'lane', details: 'result: blocked | handed-over: #99', status: 'blocked' },
      ]);
      const checked = runCli(ed, ['finalize', '--project', 'issue-1120', '--check', '--json'], repo);
      check(checked.json && checked.json.checks && checked.json.checks.mission_ledger === 'handed_over',
        'finalize[handed-over/' + edition + ']: --check accepts the hand-over as handed_over');
      const before = fs.readFileSync(ledger);
      const real = runCli(ed, ['finalize', '--project', 'issue-1120', '--json'], repo);
      check(real.status === 0,
        'finalize[handed-over/' + edition + ']: real finalize exits 0, got ' + real.status + '\n' + real.stderr);
      check(real.json && real.json.finalize_transaction
        && real.json.finalize_transaction.mission_ledger === 'handed_over',
      'finalize[handed-over/' + edition + ']: finalize_transaction.mission_ledger is handed_over');
      check(real.json && real.json.finalize_transaction
        && !real.json.finalize_transaction.findings.includes('blocked_without_handover'),
      'finalize[handed-over/' + edition + ']: no blocked_without_handover finding is raised');
      const summary = path.join(repo, 'kaola-workflow', 'archive', 'issue-1120', 'finalization-summary.md');
      check(findingSection(summary, 'blocked_without_handover') === null,
        'finalize[handed-over/' + edition + ']: no blocked_without_handover section is written');
      const archived = path.join(repo, 'kaola-workflow', 'archive', 'issue-1120', 'mission-ledger.jsonl');
      check(fs.readFileSync(archived).equals(before),
        'finalize[handed-over/' + edition + ']: the archived ledger bytes are unchanged');
    }

    // M3: an existing but unreadable ledger path (a directory) must be reported as `unreadable`,
    // never crash the transaction after the mirror step may have written — per edition.
    for (const [edition, ed] of Object.entries(EDITIONS)) {
      const repo = fixtureRepo(tmp, 'repo-unreadable-' + edition);
      const acquired = runCli(ed, ['claim', '--project', 'issue-1120', '--issue', '1120'], repo);
      check(acquired.json && acquired.json.claim === 'acquired',
        'finalize[unreadable/' + edition + ']: fixture claim acquires');
      if (!acquired.json || !acquired.json.claim) continue;
      const ledger = acquired.json.ledger_path;
      fs.rmSync(ledger, { force: true });
      fs.mkdirSync(ledger, { recursive: true });
      const real = runCli(ed, ['finalize', '--project', 'issue-1120', '--json'], repo);
      check(real.status === 0,
        'finalize[unreadable/' + edition + ']: an unreadable ledger path does not crash finalize, got '
        + real.status + '\nstdout: ' + real.stdout + '\nstderr: ' + real.stderr);
      check(real.json && real.json.finalize_transaction
        && real.json.finalize_transaction.mission_ledger === 'unreadable',
      'finalize[unreadable/' + edition + ']: finalize_transaction.mission_ledger reports unreadable');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

console.log('issue-1120 ledger hand-over: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
