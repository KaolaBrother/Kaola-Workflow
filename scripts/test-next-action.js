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
// Test 8 (AC#1): Two sibling PENDING nodes v1,v2 sharing a satisfied dep a
// (complete) → readyPending lists BOTH (the openable batch frontier) and
// active is empty (no node is in_progress).
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
  assert(r.result === 'ok', 'test8: result is ok');
  assert(Array.isArray(r.readyPending), 'test8: readyPending is an array');
  assert(r.readyPending.length === 2, 'test8: readyPending has both siblings');
  assert(r.readyPending[0].id === 'v1', 'test8: readyPending[0].id === v1 (doc order)');
  assert(r.readyPending[1].id === 'v2', 'test8: readyPending[1].id === v2');
  assert(Array.isArray(r.active), 'test8: active is an array');
  assert(r.active.length === 0, 'test8: active is empty (no in_progress node)');
  // readyPending entries carry the same descriptor shape as readySet entries.
  assert(r.readyPending[0].role === 'tdd-guide', 'test8: readyPending[0].role === tdd-guide');
  assert(r.readyPending[0].shape === 'fanout', 'test8: readyPending[0].shape === fanout');
  assert(r.readyPending[0].model === 'sonnet', 'test8: readyPending[0].model resolved');
  assert(r.readyPending[0].declared_write_set === 'scripts/v1.js',
    'test8: readyPending[0].declared_write_set carried through');
}

// -----------------------------------------------------------------------
// Test 9 (AC#5): One sibling flipped to in_progress (v1), the other pending (v2).
//   - v1 is EXCLUDED from readyPending but INCLUDED in active.
//   - v2 remains in readyPending.
//   - readySet / nextNode / allDone are BYTE-UNCHANGED from the pre-change
//     expectation: readySet still includes the in_progress node (it is NOT
//     terminal), so nextNode = readySet[0] keeps working AND a frontier that
//     is partially/fully in_progress does NOT trip the deadlock refusal.
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
      '| a        | complete    |',
      '| v1       | in_progress |',
      '| v2       | pending     |',
      '| finalize | pending     |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'ok', 'test9: result is ok (in_progress frontier is NOT a deadlock)');

  // Legacy fields byte-unchanged: readySet still includes BOTH v1 (in_progress,
  // non-terminal) and v2, in document order; nextNode = readySet[0] = v1.
  assert(r.readySet.length === 2, 'test9: readySet still includes the in_progress node');
  assert(r.readySet[0].id === 'v1', 'test9: readySet[0].id === v1 (in_progress kept, doc order)');
  assert(r.readySet[1].id === 'v2', 'test9: readySet[1].id === v2');
  assert(r.nextNode !== null && r.nextNode.id === 'v1', 'test9: nextNode === readySet[0] === v1');
  assert(r.allDone === false, 'test9: allDone is false');

  // New fields: readyPending excludes the in_progress node, active includes it.
  assert(r.readyPending.length === 1, 'test9: readyPending has only the pending sibling');
  assert(r.readyPending[0].id === 'v2', 'test9: readyPending excludes v1 (in_progress)');
  assert(!r.readyPending.some(n => n.id === 'v1'), 'test9: v1 NOT in readyPending');
  assert(r.active.length === 1, 'test9: active has the one in_progress node');
  assert(r.active[0].id === 'v1', 'test9: active[0].id === v1');
  assert(r.active[0].role === 'tdd-guide', 'test9: active[0].role carried');
  assert(r.active[0].shape === 'fanout', 'test9: active[0].shape carried');
  assert(r.active[0].model === 'sonnet', 'test9: active[0].model resolved');
  assert(r.active[0].declared_write_set === 'scripts/v1.js', 'test9: active[0].declared_write_set carried');
  assert(Array.isArray(r.active[0].dependsOn) && r.active[0].dependsOn[0] === 'a',
    'test9: active[0].dependsOn carried');

  // AC#5 multi-in_progress signal: a fully-in_progress frontier (both siblings
  // in_progress) is still ok (not a deadlock) and surfaces active.length > 1.
  const both = makePlan(
    [
      '| a        | code-explorer | —    | — | 1 | sequence          |',
      '| v1       | tdd-guide     | a    | scripts/v1.js | 1 | fanout(verify) |',
      '| v2       | tdd-guide     | a    | scripts/v2.js | 1 | fanout(verify) |',
      '| finalize | finalize      | v1,v2| — | 1 | sequence          |',
    ],
    [
      '| a        | complete    |',
      '| v1       | in_progress |',
      '| v2       | in_progress |',
      '| finalize | pending     |',
    ]
  );
  const rb = computeNextAction(both, { resolveModel: stub });
  assert(rb.result === 'ok', 'test9: fully-in_progress frontier is ok (NOT a deadlock refusal)');
  assert(rb.readyPending.length === 0, 'test9: readyPending empty when all ready nodes in_progress');
  assert(rb.active.length === 2, 'test9: active.length > 1 is the multi-in_progress signal');
}

// -----------------------------------------------------------------------
// Test 10 (AC#1/AC#5 invariant): readyPending is a (⊆) subset of readySet —
// every readyPending member appears in readySet. Verified across a mixed
// frontier (one pending, one in_progress).
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
      '| a        | complete    |',
      '| v1       | in_progress |',
      '| v2       | pending     |',
      '| finalize | pending     |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  const readyIds = new Set(r.readySet.map(n => n.id));
  assert(r.readyPending.every(n => readyIds.has(n.id)),
    'test10: readyPending is a subset of readySet (every member present)');
  // Proper subset here: the in_progress node is in readySet but not readyPending.
  assert(r.readyPending.length < r.readySet.length,
    'test10: readyPending is a PROPER subset when a ready node is in_progress');
}

// -----------------------------------------------------------------------
// Test 11 (#308): TRANSITIVE readiness — a node is ready only when its FULL
// transitive ancestor closure is terminal, not just its direct deps. Models a
// plan-repair partial reset: gate g1 reset to pending while a downstream sink
// stayed/became pending and its direct dep (mid) is still complete. Direct
// readiness would prematurely offer the sink ([g1, finalize]); transitive
// readiness excludes it because its upstream gate g1 is non-terminal → [g1].
// Topology a→g1→mid→finalize is G1-valid (the reviewer post-dominates a).
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide     | —    | scripts/foo.js | 1 | sequence |',
      '| g1       | code-reviewer | a    | —              | 1 | sequence |',
      '| mid      | doc-updater   | g1   | docs/x.md      | 1 | sequence |',
      '| finalize | finalize      | mid  | —              | 1 | sequence |',
    ],
    [
      '| a        | complete    |',
      '| g1       | pending     |',
      '| mid      | complete    |',
      '| finalize | pending     |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.result === 'ok', 'test11: result is ok');
  const ids = r.readyPending.map(n => n.id).sort();
  assert(JSON.stringify(ids) === JSON.stringify(['g1']),
    'test11 (#308): transitive readiness offers ONLY [g1], not the premature sink — got ' + JSON.stringify(ids));
  assert(!r.readySet.some(n => n.id === 'finalize'),
    'test11 (#308): finalize is excluded from readySet while its upstream gate g1 is non-terminal');
}

// -----------------------------------------------------------------------
// Test 12 (#308 regression guard): transitive readiness must NOT change normal
// forward progress — when all of a node's transitive ancestors are terminal it
// is ready exactly as before. Linear a(complete)→b(pending)→finalize: b ready.
// -----------------------------------------------------------------------
{
  const content = makePlan(
    [
      '| a        | tdd-guide | —  | scripts/foo.js | 1 | sequence |',
      '| b        | tdd-guide | a  | scripts/bar.js | 1 | sequence |',
      '| finalize | finalize  | b  | —              | 1 | sequence |',
    ],
    [
      '| a        | complete |',
      '| b        | pending  |',
      '| finalize | pending  |',
    ]
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(r.readySet.length === 1 && r.readySet[0].id === 'b',
    'test12 (#308): normal forward progress unchanged — b ready, got ' + JSON.stringify(r.readySet.map(n => n.id)));
}

// -----------------------------------------------------------------------
// test13 (#377): readyPending is ordered by longest-path-to-sink (critical path first); readySet
// stays in DOCUMENT order. A deep chain dep must out-prioritize a shallow one even when the shallow
// one appears earlier in the table.
// -----------------------------------------------------------------------
{
  const stub = () => 'sonnet';
  // shallow (q -> review -> finalize = lp 2) appears BEFORE deep (d1 -> d2 -> review -> finalize = lp 3)
  const content = [
    '## Meta', 'plan_hash: x', '',
    '## Nodes',
    '| id | role | depends_on | declared_write_set | est | shape |',
    '|----|------|-----------|--------------------|-----|-------|',
    '| a | code-explorer | — | — | 1 | sequence |',
    '| q | code-explorer | a | — | 1 | sequence |',
    '| d1 | tdd-guide | a | scripts/d1.js | 1 | sequence |',
    '| d2 | tdd-guide | d1 | scripts/d2.js | 1 | sequence |',
    '| review | code-reviewer | q,d2 | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
    '## Node Ledger', '| id | status |', '|----|--------|',
    '| a | complete |', '| q | pending |', '| d1 | pending |', '| d2 | pending |', '| review | pending |', '| finalize | pending |', '',
  ].join('\n');
  const r = computeNextAction(content, { resolveModel: stub });
  // readyPending frontier after a completes = {q (lp2), d1 (lp3)}; d1 must come FIRST (longer path).
  assert(r.readyPending.map(n => n.id).join(',') === 'd1,q',
    'test13 (#377): readyPending ordered by longest-path-to-sink (d1 before q), got ' + JSON.stringify(r.readyPending.map(n => n.id)));
  assert(r.readyPending[0].longestPathToSink === 3 && r.readyPending[1].longestPathToSink === 2,
    'test13 (#377): longestPathToSink field present + correct (d1=3, q=2), got ' + JSON.stringify(r.readyPending.map(n => n.longestPathToSink)));
  // readySet stays DOCUMENT order (q before d1) — byte-stable legacy field.
  assert(r.readySet.map(n => n.id).join(',') === 'q,d1',
    'test13 (#377): readySet stays document order (q,d1), got ' + JSON.stringify(r.readySet.map(n => n.id)));
}

// -----------------------------------------------------------------------
// Test 14 (#390b): the per-node model tier is validated at the POINT OF USE.
// A plan carrying an out-of-tier `model` (e.g. `haiku`, a real harness alias)
// passes --resume-check (revalidateForResume is freeze-only, untouched) but
// computeNextAction REFUSES it (model_invalid) so the dispatch prose never passes
// it verbatim on Agent(model=…). opus/sonnet/absent must pass through unchanged.
// Builds a 7-col ## Nodes table (the model column is the 7th cell).
// -----------------------------------------------------------------------
function makeModelPlan(nodesRows, ledgerRows) {
  return [
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | model |',
    '|---|---|---|---|---|---|---|',
    nodesRows.join('\n'), '',
    '## Node Ledger', '',
    '| id | status |', '|---|---|',
    ledgerRows.join('\n'), '',
  ].join('\n');
}
{
  // (a) haiku → refuse model_invalid (does NOT reach readySet/nextNode emit).
  const haiku = makeModelPlan(
    ['| a | tdd-guide | — | scripts/foo.js | 1 | sequence | haiku |',
     '| finalize | finalize | a | — | 1 | sequence | |'],
    ['| a | pending |', '| finalize | pending |']);
  const rh = computeNextAction(haiku, { resolveModel: stub });
  assert(rh.result === 'refuse', 'test14 (#390b): haiku model must refuse, got ' + JSON.stringify(rh));
  assert((rh.errors || []).join(';').includes('model_invalid'),
    'test14 (#390b): refusal must name model_invalid, got ' + JSON.stringify(rh.errors));
  assert(rh.errors.join(';').includes('node a'),
    'test14 (#390b): refusal must name the offending node, got ' + JSON.stringify(rh.errors));

  // (b) #610 BACK-COMPAT: legacy opus + sonnet + absent all pass through (a frozen plan resumes green).
  const ok = makeModelPlan(
    ['| a | tdd-guide | — | scripts/foo.js | 1 | sequence | opus |',
     '| b | tdd-guide | a | scripts/bar.js | 1 | sequence | sonnet |',
     '| c | tdd-guide | b | scripts/baz.js | 1 | sequence | |',
     '| finalize | finalize | c | — | 1 | sequence | |'],
    ['| a | pending |', '| b | pending |', '| c | pending |', '| finalize | pending |']);
  const ro = computeNextAction(ok, { resolveModel: stub });
  assert(ro.result === 'ok', 'test14 (#390b): legacy opus/sonnet/absent must pass, got ' + JSON.stringify(ro));
  assert(ro.nextNode.model === 'opus', 'test14 (#390b): nextNode.model honors legacy opus cell, got ' + JSON.stringify(ro.nextNode && ro.nextNode.model));

  // (c) #610: NEUTRAL tokens (reasoning/standard) are the authored vocabulary — must pass.
  const neutral = makeModelPlan(
    ['| a | tdd-guide | — | scripts/foo.js | 1 | sequence | reasoning |',
     '| b | tdd-guide | a | scripts/bar.js | 1 | sequence | standard |',
     '| finalize | finalize | b | — | 1 | sequence | |'],
    ['| a | pending |', '| b | pending |', '| finalize | pending |']);
  const rn = computeNextAction(neutral, { resolveModel: stub });
  assert(rn.result === 'ok', 'test14 (#610): neutral reasoning/standard tokens must pass, got ' + JSON.stringify(rn));
  assert(rn.nextNode.model === 'reasoning', 'test14 (#610): nextNode.model honors the neutral reasoning cell, got ' + JSON.stringify(rn.nextNode && rn.nextNode.model));

  // (d) #610: the model_invalid message lists the NEUTRAL tokens AND notes legacy aliases are accepted.
  assert(rh.errors.join(';').includes('reasoning') && rh.errors.join(';').includes('standard')
    && /legacy aliases/i.test(rh.errors.join(';')),
    'test14 (#610): model_invalid names neutral tokens + notes legacy aliases, got ' + JSON.stringify(rh.errors));
}

// -----------------------------------------------------------------------
// -----------------------------------------------------------------------
// #439/#597 speculative eligibility (additive `speculativePending`, emitted at
// speculative_open_policy:consent AND auto — omitted entirely at off / absent-field plans).
// -----------------------------------------------------------------------
// specPlan prepends a ## Meta carrying speculative_open_policy:consent so eligibility is EMITTED.
const specPlan = (nodes, ledger) => '## Meta\nspeculative_open_policy: consent\n\n' + makePlan(nodes, ledger);

// SPEC-1: a read-only node whose only unsatisfied dep is an OPEN gate is speculative-eligible.
{
  const content = specPlan(
    [
      '| impl | tdd-guide     | —    | a.js       | 1 | sequence |',
      '| gate | code-reviewer | impl | —          | 1 | sequence |',
      '| docs | doc-updater   | gate | —          | 1 | sequence |',
      '| sink | finalize      | docs | CHANGELOG.md | 1 | sequence |',
    ],
    ['| impl | complete |', '| gate | in_progress |', '| docs | pending |', '| sink | pending |']
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(Array.isArray(r.speculativePending), 'SPEC-1: speculativePending is an array at policy:consent');
  assert(r.speculativePending.length === 1 && r.speculativePending[0].id === 'docs',
    'SPEC-1: docs (read-only, only unsatisfied dep is the open gate) is speculative-eligible, got ' + JSON.stringify((r.speculativePending || []).map(n => n.id)));
  assert(r.speculativePending[0].speculativeGate === 'gate', 'SPEC-1: speculativeGate names the open gate');
  assert((r.readyPending || []).length === 0, 'SPEC-1: docs is NOT in readyPending (its gate dep is not terminal)');
}

// SPEC-2: when the gate is COMPLETE, the read node is a NORMAL ready node, NOT speculative.
{
  const content = specPlan(
    [
      '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
      '| gate | code-reviewer | impl | —    | 1 | sequence |',
      '| docs | doc-updater   | gate | —    | 1 | sequence |',
    ],
    ['| impl | complete |', '| gate | complete |', '| docs | pending |']
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert((r.speculativePending || []).length === 0, 'SPEC-2: no speculative node when the gate is complete');
  assert((r.readyPending || []).some(n => n.id === 'docs'), 'SPEC-2: docs is a normal ready node when the gate is complete');
}

// SPEC-3 (#596): a WRITE node behind an open gate IS NOW speculative-eligible (the read-only exclusion
// is lifted) PROVIDED its declared set is exact-resolvable, non-PROTECTED, and it is not the sink.
{
  const content = specPlan(
    [
      '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
      '| gate | code-reviewer | impl | —    | 1 | sequence |',
      '| more | tdd-guide     | gate | b.js | 1 | sequence |',
      '| sink | finalize      | more | CHANGELOG.md | 1 | sequence |',
    ],
    ['| impl | complete |', '| gate | in_progress |', '| more | pending |', '| sink | pending |']
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert(Array.isArray(r.speculativePending) && r.speculativePending.length === 1 && r.speculativePending[0].id === 'more',
    'SPEC-3 (#596): a well-formed write node behind an open gate IS speculative-eligible, got ' + JSON.stringify((r.speculativePending || []).map(n => n.id)));
  assert(r.speculativePending[0].speculativeGate === 'gate', 'SPEC-3 (#596): speculativeGate names the open gate');
  assert(r.speculativePending[0].declared_write_set === 'b.js', 'SPEC-3 (#596): declared_write_set carried through for the write candidate');
}

// SPEC-3b (#596): a write node whose declared set contains a PROTECTED file is NOT speculative-eligible.
// (A downstream sink hangs off `more` so the exclusion is isolated to the PROTECTED condition, not the
// sink condition — `more` would otherwise be the plan's unique sink too.)
{
  const content = specPlan(
    [
      '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
      '| gate | code-reviewer | impl | —    | 1 | sequence |',
      '| more | doc-updater   | gate | CHANGELOG.md | 1 | sequence |',
      '| sink | finalize      | more | —    | 1 | sequence |',
    ],
    ['| impl | complete |', '| gate | in_progress |', '| more | pending |', '| sink | pending |']
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert((r.speculativePending || []).length === 0, 'SPEC-3b (#596): a PROTECTED declared file excludes the write node from speculative eligibility');
}

// SPEC-3c (#596): a directory-shaped or glob declared entry is NOT exactly resolvable → NOT eligible.
// (Same downstream-sink isolation as SPEC-3b.)
{
  const dirShaped = specPlan(
    [
      '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
      '| gate | code-reviewer | impl | —    | 1 | sequence |',
      '| more | tdd-guide     | gate | scripts/ | 1 | sequence |',
      '| sink | finalize      | more | —    | 1 | sequence |',
    ],
    ['| impl | complete |', '| gate | in_progress |', '| more | pending |', '| sink | pending |']
  );
  assert((computeNextAction(dirShaped, { resolveModel: stub }).speculativePending || []).length === 0,
    'SPEC-3c (#596): a directory-shaped declared entry excludes the write node (unresolvable)');

  const globShaped = specPlan(
    [
      '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
      '| gate | code-reviewer | impl | —    | 1 | sequence |',
      '| more | tdd-guide     | gate | scripts/*.js | 1 | sequence |',
      '| sink | finalize      | more | —    | 1 | sequence |',
    ],
    ['| impl | complete |', '| gate | in_progress |', '| more | pending |', '| sink | pending |']
  );
  assert((computeNextAction(globShaped, { resolveModel: stub }).speculativePending || []).length === 0,
    'SPEC-3c (#596): a glob declared entry excludes the write node (unresolvable)');
}

// SPEC-3d (#596): the plan's unique SINK is never speculative-eligible even if it is otherwise well-formed.
{
  const content = specPlan(
    [
      '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
      '| gate | code-reviewer | impl | —    | 1 | sequence |',
      '| sink | finalize      | gate | CHANGELOG.md | 1 | sequence |',
    ],
    ['| impl | complete |', '| gate | in_progress |', '| sink | pending |']
  );
  assert((computeNextAction(content, { resolveModel: stub }).speculativePending || []).length === 0,
    'SPEC-3d (#596): the unique sink is NEVER speculative-eligible');
}

// SPEC-4: a read node with a SECOND unsatisfied (non-gate) dep is NOT speculative-eligible.
{
  const content = specPlan(
    [
      '| impl  | tdd-guide     | —          | a.js | 1 | sequence |',
      '| other | tdd-guide     | —          | b.js | 1 | sequence |',
      '| gate  | code-reviewer | impl       | —    | 1 | sequence |',
      '| docs  | doc-updater   | gate,other | —    | 1 | sequence |',
    ],
    ['| impl | complete |', '| other | in_progress |', '| gate | in_progress |', '| docs | pending |']
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert((r.speculativePending || []).length === 0, 'SPEC-4: a read node with a second unsatisfied non-gate dep is NOT eligible');
}

// SPEC-5: the unsatisfied dep must be a GATE role — a read node behind an open NON-gate node is not eligible.
{
  const content = specPlan(
    [
      '| impl | tdd-guide   | —    | a.js | 1 | sequence |',
      '| mid  | tdd-guide   | impl | b.js | 1 | sequence |',
      '| docs | doc-updater | mid  | —    | 1 | sequence |',
    ],
    ['| impl | complete |', '| mid | in_progress |', '| docs | pending |']
  );
  const r = computeNextAction(content, { resolveModel: stub });
  assert((r.speculativePending || []).length === 0, 'SPEC-5: a read node behind an open NON-gate (write) node is NOT speculative-eligible');
}

// SPEC-6 (byte-identity at default off): the SAME plan WITHOUT speculative_open_policy (policy off)
// OMITS the speculativePending key ENTIRELY — next-action output is byte-identical to pre-#439.
{
  const nodes = [
    '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
    '| gate | code-reviewer | impl | —    | 1 | sequence |',
    '| docs | doc-updater   | gate | —    | 1 | sequence |',
  ];
  const ledger = ['| impl | complete |', '| gate | in_progress |', '| docs | pending |'];
  const offR = computeNextAction(makePlan(nodes, ledger), { resolveModel: stub });   // no ## Meta ⇒ policy off
  assert(!('speculativePending' in offR), 'SPEC-6: speculativePending key is OMITTED at policy:off (byte-identity)');
  const onR = computeNextAction(specPlan(nodes, ledger), { resolveModel: stub });    // policy consent
  assert(Array.isArray(onR.speculativePending) && onR.speculativePending.length === 1,
    'SPEC-6: the SAME plan at policy:consent DOES emit speculativePending (the only delta is the policy field)');
}

// specPlanAuto prepends a ## Meta carrying speculative_open_policy:auto (the new default tier).
const specPlanAuto = (nodes, ledger) => '## Meta\nspeculative_open_policy: auto\n\n' + makePlan(nodes, ledger);

// SPEC-7 (#597 auto emission): at policy `auto`, speculativePending is emitted with the SAME shape as at
// consent (auto is on by default under the structural net); `off` still OMITS it (byte-identity preserved).
{
  const nodes = [
    '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
    '| gate | code-reviewer | impl | —    | 1 | sequence |',
    '| docs | doc-updater   | gate | —    | 1 | sequence |',
  ];
  const ledger = ['| impl | complete |', '| gate | in_progress |', '| docs | pending |'];
  const autoR = computeNextAction(specPlanAuto(nodes, ledger), { resolveModel: stub });
  assert(Array.isArray(autoR.speculativePending) && autoR.speculativePending.length === 1 && autoR.speculativePending[0].id === 'docs',
    'SPEC-7 (#597): policy:auto EMITS speculativePending (docs), got ' + JSON.stringify((autoR.speculativePending || []).map(n => n.id)));
  assert(autoR.speculativePending[0].speculativeGate === 'gate', 'SPEC-7 (#597): speculativeGate names the open gate at auto');
  const consentR = computeNextAction(specPlan(nodes, ledger), { resolveModel: stub });
  assert(JSON.stringify(autoR.speculativePending) === JSON.stringify(consentR.speculativePending),
    'SPEC-7 (#597): auto emits the SAME speculativePending set as consent (the delta is only the policy field)');
  const offR = computeNextAction(makePlan(nodes, ledger), { resolveModel: stub });
  assert(!('speculativePending' in offR), 'SPEC-7 (#597): policy:off still OMITS the key (byte-identity)');
}

// SPEC-8 (#597 AC4 — the #596 safety conditions hold IDENTICALLY at auto): a condition-violating write
// member is excluded from speculativePending at auto EXACTLY as at consent — auto relaxes the ceremony,
// never a safety condition. PROTECTED file, unresolvable set, and the unique sink are each checked at BOTH
// policies; a well-formed write member is emitted at BOTH.
{
  const protectedNodes = [
    '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
    '| gate | code-reviewer | impl | —    | 1 | sequence |',
    '| more | doc-updater   | gate | CHANGELOG.md | 1 | sequence |',
    '| sink | finalize      | more | —    | 1 | sequence |',
  ];
  const protectedLedger = ['| impl | complete |', '| gate | in_progress |', '| more | pending |', '| sink | pending |'];
  assert((computeNextAction(specPlanAuto(protectedNodes, protectedLedger), { resolveModel: stub }).speculativePending || []).length === 0,
    'SPEC-8 (#597 AC4): a PROTECTED declared file excludes the write member at auto (same as consent)');
  assert((computeNextAction(specPlan(protectedNodes, protectedLedger), { resolveModel: stub }).speculativePending || []).length === 0,
    'SPEC-8 (#597 AC4): ...and identically at consent (parity)');

  const unresolvableNodes = [
    '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
    '| gate | code-reviewer | impl | —    | 1 | sequence |',
    '| more | tdd-guide     | gate | scripts/ | 1 | sequence |',
    '| sink | finalize      | more | —    | 1 | sequence |',
  ];
  const unresolvableLedger = ['| impl | complete |', '| gate | in_progress |', '| more | pending |', '| sink | pending |'];
  assert((computeNextAction(specPlanAuto(unresolvableNodes, unresolvableLedger), { resolveModel: stub }).speculativePending || []).length === 0,
    'SPEC-8 (#597 AC4): a directory-shaped (unresolvable) declared entry excludes the write member at auto');

  const sinkNodes = [
    '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
    '| gate | code-reviewer | impl | —    | 1 | sequence |',
    '| sink | finalize      | gate | CHANGELOG.md | 1 | sequence |',
  ];
  const sinkLedger = ['| impl | complete |', '| gate | in_progress |', '| sink | pending |'];
  assert((computeNextAction(specPlanAuto(sinkNodes, sinkLedger), { resolveModel: stub }).speculativePending || []).length === 0,
    'SPEC-8 (#597 AC4): the unique sink is NEVER speculative-eligible at auto (same as consent)');

  // Control: a well-formed write member IS emitted at BOTH policies (the conditions gate only violators).
  const okNodes = [
    '| impl | tdd-guide     | —    | a.js | 1 | sequence |',
    '| gate | code-reviewer | impl | —    | 1 | sequence |',
    '| more | tdd-guide     | gate | b.js | 1 | sequence |',
    '| sink | finalize      | more | CHANGELOG.md | 1 | sequence |',
  ];
  const okLedger = ['| impl | complete |', '| gate | in_progress |', '| more | pending |', '| sink | pending |'];
  const okAuto = computeNextAction(specPlanAuto(okNodes, okLedger), { resolveModel: stub });
  const okConsent = computeNextAction(specPlan(okNodes, okLedger), { resolveModel: stub });
  assert((okAuto.speculativePending || []).length === 1 && okAuto.speculativePending[0].id === 'more',
    'SPEC-8 (#597 AC4 control): a well-formed write member IS emitted at auto');
  assert(JSON.stringify(okAuto.speculativePending) === JSON.stringify(okConsent.speculativePending),
    'SPEC-8 (#597 AC4 control): the well-formed member set is identical at auto and consent');
}

// -----------------------------------------------------------------------
// FLOOR-1..4 (#463 Slice 1 / AC14): the reasoning-class floor is ENFORCED on the dispatchable frontier.
// A ready `synthesizer` (a REASONING_FLOOR_ROLES role) whose EFFECTIVE model is not reasoning-class is a
// fail-closed `reasoning_floor_violation` refusal — the aggregator must not emit a silently-lowered
// floor role for dispatch. This is the production seam the adversarial verifier proved was unguarded.
{
  // FLOOR-1: a ready synthesizer resolving to a non-reasoning model → refuse. (enforceReasoningFloor
  // checks the EFFECTIVE model `node.model || resolveModel(role)`, so an authored sub-floor column would
  // be caught the same way; here the resolved-default path is exercised via the stub.)
  const content = makePlan(
    [
      '| synth    | synthesizer | —     | scripts/a.js | 1 | sequence |',
      '| review   | code-reviewer | synth | —          | 1 | sequence |',
      '| finalize | finalize    | review | —          | 1 | sequence |',
    ],
    [
      '| synth | pending |',
      '| review | pending |',
      '| finalize | pending |',
    ]
  );
  const rLowered = computeNextAction(content, { resolveModel: () => 'sonnet' });
  assert(rLowered.result === 'refuse', 'FLOOR-1: a ready synthesizer resolving to a non-reasoning model refuses');
  assert(rLowered.reason === 'reasoning_floor_violation', 'FLOOR-1: typed reason');
  assert(rLowered.node === 'synth' && rLowered.role === 'synthesizer', 'FLOOR-1: names the offending node/role');
  assert(rLowered.floor === 'opus', 'FLOOR-1: reports the floor');

  // FLOOR-2: the SAME plan with the synthesizer resolving to opus → ok (the floor is satisfied).
  const rOk = computeNextAction(content, { resolveModel: role => (role === 'synthesizer' ? 'opus' : 'sonnet') });
  assert(rOk.result === 'ok', 'FLOOR-2: a reasoning-class synthesizer passes');
  assert(rOk.readySet[0].id === 'synth' && rOk.readySet[0].model === 'opus', 'FLOOR-2: emits the opus synthesizer');

  // FLOOR-3: a NON-floor role resolving to sonnet is never constrained (no false refusal).
  const plainContent = makePlan(
    ['| a | tdd-guide | — | scripts/a.js | 1 | sequence |', '| finalize | finalize | a | — | 1 | sequence |'],
    ['| a | pending |', '| finalize | pending |']
  );
  assert(computeNextAction(plainContent, { resolveModel: () => 'sonnet' }).result === 'ok',
    'FLOOR-3: a non-floor role on sonnet is not refused');

  // FLOOR-4: a sub-floor synthesizer that is NOT yet ready (an unmet non-terminal dep) does NOT refuse
  // — only the DISPATCHABLE frontier is gated.
  const notReady = makePlan(
    [
      '| seed     | tdd-guide   | —     | scripts/s.js | 1 | sequence |',
      '| synth    | synthesizer | seed  | scripts/a.js | 1 | sequence |',
      '| finalize | finalize    | synth | —            | 1 | sequence |',
    ],
    ['| seed | pending |', '| synth | pending |', '| finalize | pending |']
  );
  const rNotReady = computeNextAction(notReady, { resolveModel: () => 'sonnet' });
  assert(rNotReady.result === 'ok', 'FLOOR-4: a sub-floor synthesizer behind an unmet dep does not refuse (not yet dispatchable)');
  assert(rNotReady.readySet.every(n => n.id !== 'synth'), 'FLOOR-4: the synthesizer is not in the ready frontier');
}

// Summary
// -----------------------------------------------------------------------
if (failed > 0) {
  console.error('next-action tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('next-action tests passed (' + passed + ' assertions)');
}
