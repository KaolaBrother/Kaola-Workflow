#!/usr/bin/env node
'use strict';

// Regression test for issue #399: the contractor Step-8a ledger-regression guard
// (kaola-workflow-ledger-compare.js). The guard refuses to copy a STALER main plan over a
// MORE-COMPLETE worktree plan (which would reset a finished run's ledger complete->pending), but
// FAILS OPEN on the legitimate first sync (dest absent/empty/no-ledger). Exercises both the pure
// compareLedgers function AND the real CLI exit codes (0 safe / 3 unsafe / 1 usage).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { compareLedgers, countComplete } = require('./kaola-workflow-ledger-compare');

const scriptPath = path.join(__dirname, 'kaola-workflow-ledger-compare.js');

let passed = 0;
function assert(cond, msg) {
  if (!cond) { throw new Error('FAIL: ' + msg); }
  passed++;
}

function ledger(statuses) {
  let body = '## Node Ledger\n\n| id | status |\n|----|--------|\n';
  statuses.forEach((s, i) => { body += '| n' + (i + 1) + ' | ' + s + ' |\n'; });
  body += '\n## Sink\n';
  return body;
}

function cli(args) {
  const r = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  return r;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ledger-compare-'));
const completeDest = path.join(tmp, 'worktree-plan.md');  // finished worktree ledger
const stalerSrc = path.join(tmp, 'main-plan.md');         // staler main copy
const freshSrc = path.join(tmp, 'fresh-main-plan.md');
const emptyDest = path.join(tmp, 'empty-plan.md');
const noLedger = path.join(tmp, 'no-ledger.md');
fs.writeFileSync(completeDest, ledger(['complete', 'complete', 'complete']));
fs.writeFileSync(stalerSrc, ledger(['pending', 'pending', 'pending']));
fs.writeFileSync(freshSrc, ledger(['complete', 'complete', 'complete']));
fs.writeFileSync(emptyDest, '');
fs.writeFileSync(noLedger, '# A plan with no Node Ledger section yet\n');

// Sanity: countComplete counts only `| <id> | complete |` rows in the ## Node Ledger table.
assert(countComplete(ledger(['complete', 'pending', 'complete'])) === 2,
  'countComplete must count exactly the complete rows');
assert(countComplete('# no ledger') === 0, 'countComplete returns 0 when the section is absent');

// (a) staler source < complete dest -> UNSAFE (exit 3 / safe:false / typed reason).
{
  const r = compareLedgers(fs.readFileSync(stalerSrc, 'utf8'), fs.readFileSync(completeDest, 'utf8'));
  assert(r.safe === false, '(a) staler source over complete dest must be unsafe');
  assert(r.reason === 'would_regress_complete_ledger', '(a) reason must be would_regress_complete_ledger');
  assert(r.sourceComplete === 0 && r.destComplete === 3, '(a) completeness counts must be 0/3');
  const c = cli(['--source', stalerSrc, '--dest', completeDest, '--json']);
  assert(c.status === 3, '(a) CLI must exit 3 on a regressing copy, got ' + c.status);
  assert(JSON.parse(c.stdout).reason === 'would_regress_complete_ledger', '(a) CLI JSON reason');
}

// (b) dest absent -> SAFE (exit 0 / safe:true) — first-sync fail-open.
{
  const r = compareLedgers(fs.readFileSync(completeDest, 'utf8'), null);
  assert(r.safe === true && r.reason === 'ok', '(b) dest absent must fail open (safe)');
  const absentPath = path.join(tmp, 'does-not-exist.md');
  const c = cli(['--source', completeDest, '--dest', absentPath, '--json']);
  assert(c.status === 0, '(b) CLI must exit 0 when dest is absent (first sync), got ' + c.status);
  assert(JSON.parse(c.stdout).safe === true, '(b) CLI JSON safe:true');
  // empty dest + no-ledger dest are also fail-open.
  const c2 = cli(['--source', completeDest, '--dest', emptyDest, '--json']);
  assert(c2.status === 0, '(b) CLI must exit 0 when dest is empty, got ' + c2.status);
  const c3 = cli(['--source', completeDest, '--dest', noLedger, '--json']);
  assert(c3.status === 0, '(b) CLI must exit 0 when dest has no ## Node Ledger, got ' + c3.status);
}

// (c) source >= dest -> SAFE (exit 0). Fresher main over a staler/equal worktree is fine.
{
  const r = compareLedgers(fs.readFileSync(freshSrc, 'utf8'), fs.readFileSync(stalerSrc, 'utf8'));
  // stalerSrc has 0 complete -> dest count 0 -> fail-open; use a partial dest to hit the >= path.
  assert(r.safe === true, '(c) fresher source must be safe');
  // equal completeness passes (STRICT >): complete src over complete dest.
  const rEqual = compareLedgers(fs.readFileSync(freshSrc, 'utf8'), fs.readFileSync(completeDest, 'utf8'));
  assert(rEqual.safe === true && rEqual.reason === 'ok',
    '(c) equal completeness must pass (strict >), idempotent re-run');
  const c = cli(['--source', freshSrc, '--dest', completeDest, '--json']);
  assert(c.status === 0, '(c) CLI must exit 0 on equal completeness, got ' + c.status);
}

// (d) both empty -> SAFE (exit 0).
{
  const r = compareLedgers('', '');
  assert(r.safe === true && r.reason === 'ok', '(d) both empty must be safe');
  const c = cli(['--source', emptyDest, '--dest', emptyDest, '--json']);
  assert(c.status === 0, '(d) CLI must exit 0 when both empty, got ' + c.status);
}

// Usage: missing --source is an exit-1 usage error (not a regression verdict).
{
  const c = cli(['--json']);
  assert(c.status === 1, 'missing --source must exit 1 (usage), got ' + c.status);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Ledger-compare guard regression passed (' + passed + ' assertions)');
