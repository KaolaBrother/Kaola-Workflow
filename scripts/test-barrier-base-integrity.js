#!/usr/bin/env node
'use strict';

// Integration tests for #368: the per-node barrier baseline is cross-checked against the
// gc-anchored ref (refs/kaola-workflow/barrier/<proj>/<id>). Overwriting the .cache base file
// with the SHA of a fresh snapshot (the trivial spoof) — or a missing ref while the file exists
// — is refused barrier_base_mismatch. Also covers --drop-base (file+ref deletion together).
// Uses a REAL temp git repo (the cross-check shells `git rev-parse`).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');

function git(repo, args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim(); }
function safeLastJson(s) {
  const lines = (s || '').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch (_) {} }
  return {};
}
function val(repo, planPath, args) {
  // cwd=repo: anchorBase's `git update-ref` (record-base) resolves the repo from cwd.
  try {
    const out = execFileSync(process.execPath, [VALIDATOR, planPath, ...args], { cwd: repo, encoding: 'utf8' });
    return { exitCode: 0, json: safeLastJson(out) };
  } catch (e) {
    return { exitCode: e.status || 1, json: safeLastJson((e.stdout || '').toString()) };
  }
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bb-'));
try {
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 't@t']);
  git(repo, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'seed\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);

  const projDir = path.join(repo, 'kaola-workflow', 'issue-1');
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  fs.writeFileSync(planPath, [
    '# Workflow Plan — issue-1', '', '## Meta', 'labels: refactor', '',
    '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| n1 | tdd-guide | — | scripts/x.js | 1 | sequence |',
    '| done | finalize | n1 | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| n1 | in_progress |', '| done | pending |', '',
  ].join('\n') + '\n');

  const baseFile = path.join(projDir, '.cache', 'barrier-base-n1');
  const ref = 'refs/kaola-workflow/barrier/issue-1/n1';

  // T1: record-base writes BOTH the .cache file and the anchored ref; they agree.
  const rb = val(repo, planPath, ['--record-base', '--node-id', 'n1', '--json']);
  assert(rb.json.result === 'ok', '#368 T1: record-base ok');
  const fileSha = fs.readFileSync(baseFile, 'utf8').trim();
  let refSha = '';
  try { refSha = git(repo, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']); } catch (_) {}
  assert(!!fileSha && fileSha === refSha, '#368 T1: .cache base SHA == anchored ref SHA');

  // T2: legitimate base passes the cross-check (no barrier_base_mismatch).
  const bc1 = val(repo, planPath, ['--barrier-check', '--node-id', 'n1', '--json']);
  assert(bc1.json.reason !== 'barrier_base_mismatch', '#368 T2: matching base/ref → cross-check does not refuse');

  // T3: tamper — overwrite the file with a DIFFERENT valid commit (HEAD) → refuse.
  const head = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(baseFile, head + '\n');
  const bc2 = val(repo, planPath, ['--barrier-check', '--node-id', 'n1', '--json']);
  assert(bc2.exitCode === 1 && bc2.json.reason === 'barrier_base_mismatch', '#368 T3: tampered base file SHA != ref → barrier_base_mismatch');

  // T4: correct SHA restored but the ref deleted → ref-missing-while-file-exists → refuse.
  fs.writeFileSync(baseFile, fileSha + '\n');
  git(repo, ['update-ref', '-d', ref]);
  const bc3 = val(repo, planPath, ['--barrier-check', '--node-id', 'n1', '--json']);
  assert(bc3.exitCode === 1 && bc3.json.reason === 'barrier_base_mismatch', '#368 T4: anchored ref missing while file exists → barrier_base_mismatch');

  // T5: --drop-base removes file AND ref together; idempotent.
  // #424 (D-424-01) WINDOW-LOCK: --drop-base is honored ONLY when the node's ledger status is
  // `pending` (the legal stale-baseline recovery is ledger-reset → pending → drop → fresh open). The
  // fixture above has n1 `in_progress` (so T1-T4 exercise a live baseline); reset n1 to `pending`
  // here — the legal window — before exercising the mechanical file+ref deletion.
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('| n1 | in_progress |', '| n1 | pending |'));
  try { fs.unlinkSync(baseFile); } catch (_) {}
  const rb2 = val(repo, planPath, ['--record-base', '--node-id', 'n1', '--json']);
  assert(rb2.json.result === 'ok' && fs.existsSync(baseFile), '#368 T5 setup: re-record recreates file + ref');
  const db = val(repo, planPath, ['--drop-base', '--node-id', 'n1', '--json']);
  assert(db.json.result === 'ok' && db.json.fileRemoved === true, '#368 T5: drop-base reports fileRemoved');
  assert(!fs.existsSync(baseFile), '#368 T5: base file gone after drop');
  let refGone = true;
  try { git(repo, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']); refGone = false; } catch (_) {}
  assert(refGone === true, '#368 T5: anchored ref gone after drop (no dangling ref)');
  const db2 = val(repo, planPath, ['--drop-base', '--node-id', 'n1', '--json']);
  assert(db2.json.result === 'ok', '#368 T5: second drop-base is an idempotent no-op success');
} finally {
  try { fs.rmSync(repo, { recursive: true, force: true }); } catch (_) {}
}

if (failed > 0) {
  console.error('barrier-base-integrity tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('barrier-base-integrity tests passed (' + passed + ' assertions)');
}
