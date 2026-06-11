#!/usr/bin/env node
// @generated from scripts/kaola-workflow-next-action.js by `npm run sync:editions` (issue #365) — edit canonical and regenerate; do NOT hand-edit this forge port.
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-next-action.js (issue #242)
//
// Aggregator: compute the ready-set / next node / resolved model for the
// adaptive executor. Reads a frozen workflow-plan.md and returns the set of
// nodes whose dependencies are satisfied and whose own status is non-terminal.
//
// argv: node kaola-gitea-workflow-next-action.js <plan-path> --json
//
// JSON output schema:
//   ok:     { result:'ok', readySet:[{id,role,dependsOn,model,declared_write_set,shape}],
//             nextNode:{...}|null, allDone:boolean,
//             readyPending:[...subset of readySet whose own status is pending],
//             active:[...same node-descriptor shape, every in_progress node] }
//   refuse: { result:'refuse', errors:[...] }
//
// readyPending and active are purely additive (issue #281): the openable batch
// frontier and the in_progress set. readySet/nextNode/allDone are unchanged.
//
// Exit code 1 iff result==='refuse'.
// ---------------------------------------------------------------------------

const fs = require('fs');
const { parseNodes, parseLedger } = require('./kaola-gitea-workflow-plan-validator');
const { LEDGER_STATUSES, NODE_MODEL_TIERS } = require('./kaola-workflow-adaptive-schema');

// Terminal statuses: a node in either state counts as "done" for dependency
// purposes, so an n/a node satisfies the depends_on of its successors.
const TERMINAL = new Set(['complete', 'n/a']);

/**
 * Pure IO-free core. Compute the ready-set, next node, and allDone flag.
 *
 * @param {string} content - The full text of the workflow-plan.md file.
 * @param {{ resolveModel: (role: string) => string }} opts
 * @returns {{ result: 'ok'|'refuse', readySet?: Array, nextNode?: Object|null,
 *             allDone?: boolean, errors?: string[] }}
 */
function computeNextAction(content, opts) {
  const resolveModel = (opts && opts.resolveModel) || (() => '');

  // 1. Parse nodes. Empty parse => refuse.
  const nodes = parseNodes(content);
  if (!nodes.length) {
    return { result: 'refuse', errors: ['plan has no parseable ## Nodes table'] };
  }

  // 2. Parse the ledger (may be empty Map if section absent).
  const ledger = parseLedger(content);

  // 3. Validate ledger statuses: every status PRESENT in the ledger must be
  //    in LEDGER_STATUSES. Nodes absent from the ledger default to 'pending'
  //    (in-enum) and are not checked here.
  for (const [id, st] of ledger) {
    if (!LEDGER_STATUSES.includes(st)) {
      return {
        result: 'refuse',
        errors: ['node ' + id + ' has out-of-enum ledger status "' + st + '"'],
      };
    }
  }

  // #390(b): validate the per-node model tier at the POINT OF USE. The freeze-time check
  // (plan-validator computeNextAction-adjacent) only guards plans frozen by a #382-aware
  // validator. A plan frozen pre-#382 (or hash-stamped via the exported computePlanHash/
  // injectHash to dodge --freeze) passes --resume-check ok:true yet may carry `model: haiku` —
  // a real harness alias the dispatch prose would pass verbatim on every Agent(model=…) call.
  // revalidateForResume deliberately stays untouched (the #381 freeze-only landmine: a legacy
  // plan must still resume-check), so the tier wall lives HERE, where the model is consumed.
  for (const node of nodes) {
    if (node.model && !NODE_MODEL_TIERS.includes(node.model)) {
      return {
        result: 'refuse',
        errors: ['node ' + node.id + ' model "' + node.model + '" is not in NODE_MODEL_TIERS (model_invalid) — use one of: ' + NODE_MODEL_TIERS.join(', ')],
      };
    }
  }

  // Helper: effective status for a node id.
  const st = id => ledger.get(id) || 'pending';

  // #308: TRANSITIVE-ancestor readiness. A node is ready only when its FULL upstream
  // closure is terminal — not merely its direct deps. This withholds a downstream sink
  // when an UPSTREAM gate was reset to pending by a plan-repair, even though the sink's
  // own direct deps are still complete (the premature-frontier defect). During normal
  // forward progress a node cannot complete before its deps, so direct-terminal implies
  // transitive-terminal — i.e. this is identical to the old direct check EXCEPT after a
  // repair reset. Cycle-guarded (visited set); plans are DAGs but next-action may run on
  // a mid-repair plan, so fail-safe rather than recurse.
  const byId = new Map(nodes.map(n => [n.id, n]));
  const allAncestorsTerminal = startId => {
    const start = byId.get(startId);
    const stack = start ? start.dependsOn.slice() : [];
    const visited = new Set();
    while (stack.length) {
      const d = stack.pop();
      if (visited.has(d)) continue;
      visited.add(d);
      if (!TERMINAL.has(st(d))) return false;
      const dn = byId.get(d);
      if (dn) for (const dd of dn.dependsOn) stack.push(dd);
    }
    return true;
  };

  // 4. Compute ready-set in document order (parseNodes preserves table order).
  const readySet = nodes
    .filter(node => {
      // Node itself must not be terminal.
      if (TERMINAL.has(st(node.id))) return false;
      // #308: ALL transitive ancestors must be terminal (n/a satisfies readiness).
      return allAncestorsTerminal(node.id);
    })
    .map(node => ({
      id: node.id,
      role: node.role,
      dependsOn: node.dependsOn,
      model: node.model || resolveModel(node.role),
      declared_write_set: node.writeSetRaw,
      shape: node.shape.kind,
    }));

  // 5. allDone: every node is in a terminal state.
  const allDone = nodes.every(n => TERMINAL.has(st(n.id)));

  // 6. Stalled: readySet empty but not all done → refuse (corrupt/deadlocked plan).
  //    allDone with empty readySet is result:'ok' (the Phase-6 handoff signal).
  if (readySet.length === 0 && !allDone) {
    return {
      result: 'refuse',
      errors: ['plan is stalled: no ready nodes and not all nodes are terminal (deadlock or corrupt ledger)'],
    };
  }

  // 7. Batch-frontier fields (purely additive; the legacy fields above are
  //    byte-unchanged). readyPending = the openable frontier the scheduler may
  //    fan out (readySet members whose OWN status is still 'pending', i.e. not
  //    yet 'in_progress'). active = every node whose own status is 'in_progress'
  //    (one per legacy run, N during a batch); active.length > 1 is the
  //    multi-in_progress (batch) signal. readySet still includes in_progress
  //    nodes (only TERMINAL nodes are excluded), so nextNode = readySet[0] keeps
  //    working and a fully-in_progress frontier does NOT trip the stall refusal.
  // #377: longest-path-to-sink PRIORITY for the running-set scheduler (additive; classic list
  // scheduling on the frozen DAG). readySet/nextNode/allDone/active stay byte-unchanged — only
  // readyPending gains a `longestPathToSink` field and is ordered by it (desc) so the critical path
  // opens first; DOCUMENT order is the stable tiebreak. Cycle-guarded (fail-safe on a mid-repair plan).
  const children = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) for (const d of n.dependsOn) { if (children.has(d)) children.get(d).push(n.id); }
  const lpMemo = new Map();
  const longestPathToSink = id => {
    if (lpMemo.has(id)) return lpMemo.get(id);
    lpMemo.set(id, 0); // provisional (cycle guard); a DAG never revisits, a mid-repair cycle stays finite
    let best = 0;
    for (const c of (children.get(id) || [])) best = Math.max(best, 1 + longestPathToSink(c));
    lpMemo.set(id, best);
    return best;
  };
  const docIndex = new Map(nodes.map((n, i) => [n.id, i]));
  const readyPending = readySet
    .filter(n => st(n.id) === 'pending')
    .map(n => Object.assign({}, n, { longestPathToSink: longestPathToSink(n.id) }))
    .sort((a, b) => (b.longestPathToSink - a.longestPathToSink) || (docIndex.get(a.id) - docIndex.get(b.id)));
  const active = nodes
    .filter(node => st(node.id) === 'in_progress')
    .map(node => ({
      id: node.id,
      role: node.role,
      dependsOn: node.dependsOn,
      model: node.model || resolveModel(node.role),
      declared_write_set: node.writeSetRaw,
      shape: node.shape.kind,
    }));

  return {
    result: 'ok',
    readySet,
    nextNode: readySet[0] || null,
    allDone,
    readyPending,
    active,
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all FS and process I/O lives here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-gitea-workflow-next-action.js <plan-path> --json\n' +
      '  Computes the ready-set / next node / model for the adaptive executor.\n' +
      '  Exit 1 on refuse.\n'
    );
    return;
  }

  const planPath = args[0];

  let content;
  try {
    content = fs.readFileSync(planPath, 'utf8');
  } catch (_) {
    const out = { result: 'refuse', errors: ['cannot read plan: ' + planPath] };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

  const resolveModel = role =>
    require('./kaola-workflow-resolve-agent-model').resolveAgentModel(role);

  const result = computeNextAction(content, { resolveModel });
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.result === 'refuse') process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = { computeNextAction };
