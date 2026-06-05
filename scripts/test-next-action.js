#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-next-action.js
// Hand-rolled assert + counter; repo style (no framework).

const { computeNextAction } = require('./kaola-workflow-next-action');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Stub resolveModel
const stub = role => ({ 'tdd-guide': 'sonnet', planner: 'opus', finalize: '' }[role] ?? 'sonnet');

// Helper to build synthetic plan content
function makePlan(nodesRows, ledgerRows) {
  const nodeHeader = '| id | role | depends_on | declared_write_set | cardinality | shape |';
  const nodeSep    = '|---|---|---|---|---|---|';
  const nodeBody   = nodesRows.join('\n');
  const ledgerHeader = '| id | status |';
  const ledgerSep    = '|---|---|';
  const ledgerBody   = ledgerRows.join('\n');
  return [
    '## Nodes',
    '',
    nodeHeader,
    nodeSep,
    nodeBody,
    '',
    '## Node Ledger',
    '',
    ledgerHeader,
    ledgerSep,
    ledgerBody,
    '',
  ].join('\n');
}

// -----------------------------------------------------------------------
// Test 1: Linear a→b→finalize, all pending → readySet=[a]
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide | —        | scripts/foo.js | 1 | sequence |',
      '| b        | tdd-guide | a        | scripts/bar.js | 1 | sequence |',
      '| finalize | finalize  | b        | —              | 1 | sequence |',
    ],
    [
      '| a        | pending |',
      '| b        | pending |',
      '| finalize | pending |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'ok', 'test1: result is ok');
  assert(r.allDone === false, 'test1: allDone is false');
  assert(r.readySet.length === 1, 'test1: readySet has one entry');
  assert(r.readySet[0].id === 'a', 'test1: readySet[0].id === a');
  assert(r.nextNode !== null, 'test1: nextNode is not null');
  assert(r.nextNode.id === 'a', 'test1: nextNode.id === a');
  assert(r.nextNode.model === 'sonnet', 'test1: nextNode.model === sonnet');
}

// -----------------------------------------------------------------------
// Test 2: a status n/a, b pending (b depends on a) → b IS in readySet
// (the n/a-unblocks assertion)
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide | —        | scripts/foo.js | 1 | sequence |',
      '| b        | tdd-guide | a        | scripts/bar.js | 1 | sequence |',
      '| finalize | finalize  | b        | —              | 1 | sequence |',
    ],
    [
      '| a        | n/a     |',
      '| b        | pending |',
      '| finalize | pending |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'ok', 'test2: result is ok');
  assert(r.readySet.some(n => n.id === 'b'), 'test2: b IS in readySet (n/a dep unblocks)');
  assert(r.nextNode !== null && r.nextNode.id === 'b', 'test2: nextNode.id === b');
}

// -----------------------------------------------------------------------
// Test 3: Two fanout(verify) siblings v1,v2 depend on a(complete), both pending
// → readySet.length===2, ids in document order, each shape==='fanout'
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | code-explorer | —    | — | 1 | sequence          |',
      '| v1       | tdd-guide     | a    | scripts/v1.js | 1 | fanout(verify) |',
      '| v2       | tdd-guide     | a    | scripts/v2.js | 1 | fanout(verify) |',
      '| finalize | finalize      | v1,v2| — | 1 | sequence          |',
    ],
    [
      '| a        | complete |',
      '| v1       | pending  |',
      '| v2       | pending  |',
      '| finalize | pending  |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'ok', 'test3: result is ok');
  assert(r.readySet.length === 2, 'test3: readySet.length === 2');
  assert(r.readySet[0].id === 'v1', 'test3: readySet[0].id === v1 (document order)');
  assert(r.readySet[1].id === 'v2', 'test3: readySet[1].id === v2');
  assert(r.readySet[0].shape === 'fanout', 'test3: readySet[0].shape === fanout');
  assert(r.readySet[1].shape === 'fanout', 'test3: readySet[1].shape === fanout');
}

// -----------------------------------------------------------------------
// Test 4: All nodes complete/n/a → allDone===true, readySet.length===0,
// nextNode===null, result==='ok'
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide | —  | scripts/foo.js | 1 | sequence |',
      '| finalize | finalize  | a  | —              | 1 | sequence |',
    ],
    [
      '| a        | complete |',
      '| finalize | n/a      |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'ok', 'test4: result is ok (allDone is ok, not refuse)');
  assert(r.allDone === true, 'test4: allDone is true');
  assert(r.readySet.length === 0, 'test4: readySet is empty');
  assert(r.nextNode === null, 'test4: nextNode is null');
}

// -----------------------------------------------------------------------
// Test 5: A node's ledger status = "bogus" (out-of-enum) → result==='refuse',
// errors mention the bad status
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide | — | scripts/foo.js | 1 | sequence |',
      '| finalize | finalize  | a | —              | 1 | sequence |',
    ],
    [
      '| a        | bogus   |',
      '| finalize | pending |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'refuse', 'test5: result is refuse on out-of-enum status');
  assert(Array.isArray(r.errors) && r.errors.length > 0, 'test5: errors is non-empty array');
  assert(r.errors.some(e => e.includes('bogus')), 'test5: error message mentions "bogus"');
  assert(r.errors.some(e => e.includes('a')), 'test5: error message mentions node id "a"');
}

// -----------------------------------------------------------------------
// Bonus: finalize-ready fixture → finalize model === ''
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide | — | scripts/foo.js | 1 | sequence |',
      '| finalize | finalize  | a | —              | 1 | sequence |',
    ],
    [
      '| a        | complete |',
      '| finalize | pending  |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'ok', 'bonus: result is ok');
  const fin = r.readySet.find(n => n.id === 'finalize');
  assert(fin !== undefined, 'bonus: finalize is in readySet');
  assert(fin.model === '', 'bonus: finalize.model === empty string');
}

// -----------------------------------------------------------------------
// Test 6: Stalled/deadlocked plan — a 2-cycle (a↔b) leaves the readySet empty
// while NOT allDone → result==='refuse', error mentions "stalled".
// (mutation-proven gap: neutering the stalled guard left the suite green.)
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide | b | scripts/foo.js | 1 | sequence |',
      '| b        | tdd-guide | a | scripts/bar.js | 1 | sequence |',
      '| finalize | finalize  | a | —              | 1 | sequence |',
    ],
    [
      '| a        | pending |',
      '| b        | pending |',
      '| finalize | pending |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'refuse', 'test6: stalled/cyclic plan is refused');
  assert(Array.isArray(r.errors) && r.errors.some(e => e.includes('stalled')),
    'test6: error mentions "stalled"');
  assert(!('readySet' in r) || r.readySet === undefined, 'test6: no readySet on refuse');
}

// -----------------------------------------------------------------------
// Test 7: No parseable ## Nodes table → result==='refuse', error mentions Nodes.
// (mutation-proven gap: neutering the empty-Nodes refuse left the suite green.)
// -----------------------------------------------------------------------
{
  const noNodes = '## Node Ledger\n\n| id | status |\n|---|---|\n| a | pending |\n';
  const r = computeNextAction(noNodes, { resolveModel: stub });
  assert(r.result === 'refuse', 'test7: plan with no ## Nodes table is refused');
  assert(Array.isArray(r.errors) && r.errors.some(e => e.includes('Nodes')),
    'test7: error mentions the missing Nodes table');

  // and an entirely empty document
  const empty = computeNextAction('', { resolveModel: stub });
  assert(empty.result === 'refuse', 'test7: empty document is refused');
}

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------
if (failed > 0) {
  console.error('next-action tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('next-action tests passed (' + passed + ' assertions)');
}
