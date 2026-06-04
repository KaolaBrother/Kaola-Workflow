#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-next-action.js (issue #242)
//
// Aggregator: compute the ready-set / next node / resolved model for the
// adaptive executor. Reads a frozen workflow-plan.md and returns the set of
// nodes whose dependencies are satisfied and whose own status is non-terminal.
//
// argv: node kaola-workflow-next-action.js <plan-path> --json
//
// JSON output schema:
//   ok:     { result:'ok', readySet:[{id,role,dependsOn,model,declared_write_set,shape}],
//             nextNode:{...}|null, allDone:boolean }
//   refuse: { result:'refuse', errors:[...] }
//
// Exit code 1 iff result==='refuse'.
// ---------------------------------------------------------------------------

const fs = require('fs');
const { parseNodes, parseLedger } = require('./kaola-workflow-plan-validator');
const { LEDGER_STATUSES } = require('./kaola-workflow-adaptive-schema');

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

  // Helper: effective status for a node id.
  const st = id => ledger.get(id) || 'pending';

  // 4. Compute ready-set in document order (parseNodes preserves table order).
  const readySet = nodes
    .filter(node => {
      // Node itself must not be terminal.
      if (TERMINAL.has(st(node.id))) return false;
      // All dependencies must be terminal (n/a satisfies readiness).
      return node.dependsOn.every(d => TERMINAL.has(st(d)));
    })
    .map(node => ({
      id: node.id,
      role: node.role,
      dependsOn: node.dependsOn,
      model: resolveModel(node.role),
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

  return {
    result: 'ok',
    readySet,
    nextNode: readySet[0] || null,
    allDone,
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all FS and process I/O lives here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-workflow-next-action.js <plan-path> --json\n' +
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
