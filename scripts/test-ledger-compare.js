#!/usr/bin/env node
'use strict';

// Regression test for the worktree→main anti-clobber fence (kaola-workflow-ledger-compare.js,
// issue #399 — re-pointed at the MISSION LIST by #877). The guard refuses to copy a STALER main
// record over a MORE-COMPLETE worktree record (which would reset a finished run's `status: done`
// items back to open), but FAILS OPEN on the legitimate first sync (dest absent/empty/zero-done).
// Exercises the pure functions (countComplete, compareLedgers) AND the real CLI exit codes
// (0 safe / 3 unsafe / 1 usage) — the same contract the retired ## Node Ledger suite pinned.
//
// What it counts now is `status: done` lines of docs/mission-list.md's format, at any indent,
// including the hand-edited variants the fence's own tiny parse deliberately accepts. The parse is
// LINE-ANCHORED, not field-aware — see the "known coarseness" case below, pinned as-is on purpose.

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

// A mission list in the DOCUMENTED format (docs/mission-list.md): H1 goal, `- item:` bullets,
// two-space-indented fields, `dispatched` on in-flight/done items, `result` on done items.
function record(statuses) {
  const lines = ['# fence fixture — one goal line', ''];
  statuses.forEach((s, i) => {
    lines.push('- item: mission ' + (i + 1) + ', one line of prose');
    lines.push('  status: ' + s);
    if (s !== 'todo') lines.push('  dispatched: agent-' + (i + 1) + ', output to out/' + (i + 1) + '.md');
    if (s === 'done') lines.push('  result: out/' + (i + 1) + '.md');
    lines.push('');
  });
  return lines.join('\n');
}

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
}

// --- countComplete over the documented format ----------------------------------------------
assert(countComplete(record(['done', 'in-flight', 'done', 'todo'])) === 2,
  'countComplete must count exactly the `status: done` items of a documented-format list');
assert(countComplete(record(['todo', 'in-flight'])) === 0,
  'countComplete returns 0 when the list records nothing done');
assert(countComplete('# just a goal line, no items yet\n') === 0,
  'countComplete returns 0 on a list with no items');
assert(countComplete('') === 0 && countComplete(null) === 0 && countComplete(undefined) === 0,
  'countComplete returns 0 on empty/absent input (the fail-open signal compareLedgers reads)');

// --- hand-edited variants the regex deliberately ACCEPTS -----------------------------------
// The documented format indents fields by two spaces, but the fence owns a tolerant parse: a
// hand-edited file legitimately varies (the guard's source file says so). Each accepted variant
// is pinned individually so a tightening of the regex is a visible contract change here.
for (const [line, label] of [
  ['- status: done', 'bullet form (`- status: done`)'],
  ['status: done', 'zero indent'],
  ['\tstatus: done', 'tab indent'],
  ['  STATUS: DONE', 'upper case'],
  ['  Status: Done', 'mixed case'],
  ['  status: done  ', 'trailing spaces'],
  ['  status: done\t', 'trailing tab'],
  ['  status:done', 'no space after the colon'],
]) {
  assert(countComplete('# g\n\n- item: x\n' + line + '\n') === 1,
    'countComplete must accept the hand-edited variant: ' + label);
}

// --- lines that must NOT count ---------------------------------------------------------------
for (const [line, label] of [
  ['  status: todo', 'status: todo'],
  ['  status: in-flight', 'status: in-flight'],
  ['  status: done and verified', '`status: done` with trailing text'],
  ['  status: donee', 'a longer word starting with done'],
  ['  status : done', 'space before the colon'],
  ['-status: done', 'dash with no space (not the bullet form)'],
  ['  dispatched: status: done', '`status: done` inside another field, same line'],
]) {
  assert(countComplete('# g\n\n- item: x\n' + line + '\n') === 0,
    'countComplete must NOT count: ' + label);
}

// --- KNOWN COARSENESS, pinned as current behavior --------------------------------------------
// A `status: done` line inside a multi-line `result:` block ALSO counts: the parse is
// line-anchored and cannot tell an item field from quoted prose at a deeper indent. Verified by
// running the shipped regex — this pins what it DOES, not what a field-aware parser would do.
// Tolerable because the guard is COMPARATIVE (strict >): the same record is counted the same way
// on both sides of the mirror, so a symmetric over-count cannot manufacture a refusal on an
// idempotent re-run. If this assertion starts failing, the parse got smarter — re-decide the pin.
{
  const withQuotedStatus = [
    '# g', '',
    '- item: port the fence',
    '  status: done',
    '  dispatched: self',
    '  result: |',
    "    the sub-run's own record ended with",
    '    status: done',
    ''
  ].join('\n');
  assert(countComplete(withQuotedStatus) === 2,
    'KNOWN COARSENESS: a `status: done` line inside a multi-line result: block counts too '
    + '(line-anchored parse; got ' + countComplete(withQuotedStatus) + ')');
}

// --- compareLedgers + the real CLI ------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ledger-compare-'));
const moreDoneDest = path.join(tmp, 'worktree-mission-list.md');  // finished worktree record
const stalerSrc = path.join(tmp, 'main-mission-list.md');         // staler main copy
const freshSrc = path.join(tmp, 'fresh-main-mission-list.md');
const emptyDest = path.join(tmp, 'empty-mission-list.md');
const zeroDoneDest = path.join(tmp, 'zero-done-mission-list.md');
fs.writeFileSync(moreDoneDest, record(['done', 'done', 'done']));
fs.writeFileSync(stalerSrc, record(['done', 'in-flight', 'todo']));
fs.writeFileSync(freshSrc, record(['done', 'done', 'done']));
fs.writeFileSync(emptyDest, '');
fs.writeFileSync(zeroDoneDest, record(['todo', 'in-flight']));

// (a) staler source < more-done dest -> UNSAFE (exit 3 / safe:false / typed reason).
{
  const r = compareLedgers(fs.readFileSync(stalerSrc, 'utf8'), fs.readFileSync(moreDoneDest, 'utf8'));
  assert(r.safe === false, '(a) a staler main copy over a more-done worktree record must be unsafe');
  assert(r.reason === 'would_regress_complete_ledger', '(a) reason must be would_regress_complete_ledger');
  assert(r.sourceComplete === 1 && r.destComplete === 3, '(a) done counts must be 1/3, got '
    + r.sourceComplete + '/' + r.destComplete);
  const c = cli(['--source', stalerSrc, '--dest', moreDoneDest, '--json']);
  assert(c.status === 3, '(a) CLI must exit 3 on a regressing copy, got ' + c.status);
  assert(JSON.parse(c.stdout).reason === 'would_regress_complete_ledger', '(a) CLI JSON reason');
}

// (b) dest absent/empty/zero-done -> SAFE (exit 0) — the legitimate first-sync fail-open.
{
  const r = compareLedgers(fs.readFileSync(moreDoneDest, 'utf8'), null);
  assert(r.safe === true && r.reason === 'ok', '(b) dest absent must fail open (safe)');
  const absentPath = path.join(tmp, 'does-not-exist.md');
  const c = cli(['--source', moreDoneDest, '--dest', absentPath, '--json']);
  assert(c.status === 0, '(b) CLI must exit 0 when dest is absent (first sync), got ' + c.status);
  assert(JSON.parse(c.stdout).safe === true, '(b) CLI JSON safe:true');
  const c2 = cli(['--source', moreDoneDest, '--dest', emptyDest, '--json']);
  assert(c2.status === 0, '(b) CLI must exit 0 when dest is empty, got ' + c2.status);
  const c3 = cli(['--source', moreDoneDest, '--dest', zeroDoneDest, '--json']);
  assert(c3.status === 0, '(b) CLI must exit 0 when dest records nothing done, got ' + c3.status);
}

// (c) source >= dest -> SAFE (exit 0). A fresher main copy, and the EQUAL-counts idempotent
// re-run of the mirror (STRICT >), both pass.
{
  const r = compareLedgers(fs.readFileSync(freshSrc, 'utf8'), fs.readFileSync(stalerSrc, 'utf8'));
  assert(r.safe === true && r.reason === 'ok', '(c) a fresher source over a staler dest must be safe');
  assert(r.sourceComplete === 3 && r.destComplete === 1, '(c) done counts must be 3/1');
  const rEqual = compareLedgers(fs.readFileSync(freshSrc, 'utf8'), fs.readFileSync(moreDoneDest, 'utf8'));
  assert(rEqual.safe === true && rEqual.reason === 'ok',
    '(c) equal done counts must pass (strict >) — an idempotent mirror re-run is never refused');
  const c = cli(['--source', freshSrc, '--dest', moreDoneDest, '--json']);
  assert(c.status === 0, '(c) CLI must exit 0 on equal counts, got ' + c.status);
}

// (d) both empty -> SAFE (exit 0).
{
  const r = compareLedgers('', '');
  assert(r.safe === true && r.reason === 'ok', '(d) both empty must be safe');
  const c = cli(['--source', emptyDest, '--dest', emptyDest, '--json']);
  assert(c.status === 0, '(d) CLI must exit 0 when both empty, got ' + c.status);
}

// Usage errors are exit 1 (never a regression verdict): missing --source, an unreadable
// --source, an unknown argument. --help exits 0 and documents the exit-code contract.
{
  const c = cli(['--json']);
  assert(c.status === 1, 'missing --source must exit 1 (usage), got ' + c.status);
  const c2 = cli(['--source', path.join(tmp, 'no-such-source.md'), '--dest', moreDoneDest]);
  assert(c2.status === 1, 'an unreadable --source must exit 1 (usage/environment), got ' + c2.status);
  const c3 = cli(['--source', freshSrc, '--frobnicate']);
  assert(c3.status === 1, 'an unknown argument must exit 1, got ' + c3.status);
  const h = cli(['--help']);
  assert(h.status === 0 && /exit 3/.test(h.stdout),
    '--help must exit 0 and document the unsafe exit code, got ' + h.status);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Ledger-compare fence regression passed (' + passed + ' assertions)');
