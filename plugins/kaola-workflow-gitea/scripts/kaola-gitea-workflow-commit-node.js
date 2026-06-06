#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-commit-node.js (issue #242)
//
// Aggregator: per-node / whole-plan barrier entry point.
// Composes the plan-validator subcommands into one auditable call — it SHELLS
// the validator; it does NOT reimplement it.
//
// argv: node kaola-workflow-commit-node.js <plan-path> [--node-id <id>] [--start] --json
//
// Modes:
//   --node-id ID --start   per-node-start: record-base only (idempotent)
//   --node-id ID           per-node end:   barrier-check + gate-verify (informational) + verdict-check (informational)
//   (no --node-id)         whole-plan:     barrier-check + gate-verify (both blocking)
//
// JSON output schema:
//   { result:'ok'|'refuse', mode, nodeId:string|null,
//     recordBase:object|null, barrierCheck:object|null, gateVerify:object|null,
//     verdictCheck:object|null, overallOk:boolean }
//
// Early-refuse (result:'refuse', exit 1, no shelling):
//   --start without --node-id   → errors:['--start requires --node-id']
//   --node-id present but empty → errors:['--node-id requires a value']
// ---------------------------------------------------------------------------

const path = require('path');
const { execFileSync } = require('child_process');

// The validator filename constant — the ONLY token that differs across forge ports.
// Keep on its own clearly-named line so the port is a one-line edit.
const VALIDATOR = 'kaola-gitea-workflow-plan-validator.js';

// Resolve validator path relative to this script's own directory (so forge ports
// under plugins/…/scripts/ find their forge-named sibling correctly).
const validatorPath = path.join(__dirname, VALIDATOR);

// ---------------------------------------------------------------------------
// safeJsonParse — returns {} on any parse failure (fail-closed).
// ---------------------------------------------------------------------------
function safeJsonParse(str) {
  try { return JSON.parse(str || ''); } catch (_) { return {}; }
}

// ---------------------------------------------------------------------------
// shellValidator — thin seam that executes the validator via execFileSync and
// returns { exitCode, ...parsedJson }. Exported so tests can point a stub validator.
//
// @param {string} vPath     absolute path to the validator script to shell
// @param {string} planPath  path to the workflow-plan.md
// @param {string[]} flags   extra CLI flags (e.g. ['--barrier-check', '--json'])
// @returns {{ exitCode:number, [key:string]: any }}
// ---------------------------------------------------------------------------
function shellValidator(vPath, planPath, flags) {
  let stdout;
  try {
    stdout = execFileSync('node', [vPath, planPath, ...flags], { encoding: 'utf8' });
    return { exitCode: 0, ...safeJsonParse(stdout) };
  } catch (err) {
    // The validator writes valid JSON to stdout even on exit 1; read err.stdout.
    const status = (err.status == null) ? 1 : err.status; // fail-closed on signal kill
    return { exitCode: status, ...safeJsonParse(err.stdout) };
  }
}

// ---------------------------------------------------------------------------
// combineResults — pure IO-free core.
//
// Inputs:
//   steps: { recordBase, barrierCheck, gateVerify, verdictCheck, selectorCheck }
//     each is { exitCode, ...parsedJson } | null
//   opts:  { mode: 'per-node-start'|'per-node'|'whole-plan', nodeId?: string }
//
// Returns the complete JSON output object (caller writes it to stdout).
// ---------------------------------------------------------------------------
function combineResults(steps, opts) {
  const mode = opts.mode;
  const nodeId = opts.nodeId || null;
  const { recordBase, barrierCheck, gateVerify, verdictCheck, selectorCheck } = steps;

  let overallOk;
  let gvOut = gateVerify;
  let vcOut = verdictCheck;

  if (mode === 'per-node-start') {
    // Only record-base ran. overallOk = recordBase ok.
    overallOk = !!(recordBase && recordBase.exitCode === 0 && recordBase.result === 'ok');
    gvOut = null;
    vcOut = null;
  } else if (mode === 'per-node') {
    // Barrier-check is blocking; gate-verify is INFORMATIONAL only (prevents deadlock:
    // downstream reviewer is still pending when this node commits).
    // verdict-check is also INFORMATIONAL per-node (no deadlock when reviewer hasn't run yet).
    const barrierPass = !!(barrierCheck && barrierCheck.exitCode === 0 && barrierCheck.result === 'pass');
    // #263: selector-check is BLOCKING per-node (checks the completing node's own .cache, like
    // barrier-check — no deadlock risk). A non-selector node returns isSelector:false/ok:true
    // (never false-blocks). A selector_source with missing/foreign selector returns ok:false/exit 1
    // => fails the commit (fail-closed). Absent (null/undefined) => selectorPass true (back-compat).
    const selectorPass = (selectorCheck == null) ? true
      : (selectorCheck.exitCode === 0 && selectorCheck.ok === true);
    overallOk = barrierPass && selectorPass;
    // Tag gate-verify as informational — do NOT include it in overallOk.
    if (gateVerify != null) {
      gvOut = { ...gateVerify, informational: true };
    }
    // Tag verdict-check as informational — do NOT include it in overallOk.
    if (verdictCheck != null) {
      vcOut = { ...verdictCheck, informational: true };
    }
  } else {
    // whole-plan: barrier-check is mandatory (strict). Review gates (gate-verify, verdict-check)
    // block only when PRESENT-and-failing. main() always shells both in whole-plan and each
    // fail-closes internally (e.g. --verdict-check exits 1 on a missing/failing gate verdict),
    // so an ABSENT result here means "not provided", never "passed silently" — the aggregator
    // must not fabricate a failure from an omitted optional arg. Kept symmetric across both gates.
    const barrierPass = !!(barrierCheck && barrierCheck.exitCode === 0 && barrierCheck.result === 'pass');
    const gatePass = (gateVerify == null) ? true : (gateVerify.exitCode === 0 && gateVerify.ok === true);
    const verdictPass = (verdictCheck == null) ? true : (verdictCheck.exitCode === 0 && verdictCheck.ok === true);
    overallOk = barrierPass && gatePass && verdictPass;
    // whole-plan gateVerify and verdictCheck must NOT carry informational.
    gvOut = gateVerify;
    vcOut = verdictCheck;
  }

  return {
    result: overallOk ? 'ok' : 'refuse',
    mode,
    nodeId,
    recordBase: mode === 'per-node-start' ? recordBase : null,
    barrierCheck: mode !== 'per-node-start' ? barrierCheck : null,
    gateVerify: gvOut,
    verdictCheck: vcOut,
    selectorCheck: (selectorCheck !== undefined) ? selectorCheck : null,
    overallOk,
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all process I/O lives here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-workflow-commit-node.js <plan-path> [--node-id <id>] [--start] --json\n' +
      '  --node-id ID --start  per-node-start: record-base only (idempotent)\n' +
      '  --node-id ID          per-node end:   barrier-check + gate-verify + verdict-check (all informational)\n' +
      '  (no --node-id)        whole-plan:     barrier-check + gate-verify + verdict-check (all blocking)\n'
    );
    return;
  }

  const planPath = args[0];

  // Parse --node-id value.
  const nodeIdIdx = args.indexOf('--node-id');
  const hasNodeIdFlag = nodeIdIdx >= 0;
  const nodeIdValue = (hasNodeIdFlag && nodeIdIdx + 1 < args.length) ? args[nodeIdIdx + 1] : null;

  const hasStart = args.includes('--start');

  // Early-refuse: --start without --node-id
  if (hasStart && !hasNodeIdFlag) {
    const out = { result: 'refuse', mode: null, nodeId: null, recordBase: null, barrierCheck: null, gateVerify: null, overallOk: false, errors: ['--start requires --node-id'] };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

  // Early-refuse: --node-id flag present but value is missing or starts with '--'
  if (hasNodeIdFlag && (!nodeIdValue || nodeIdValue.startsWith('--'))) {
    const out = { result: 'refuse', mode: null, nodeId: null, recordBase: null, barrierCheck: null, gateVerify: null, overallOk: false, errors: ['--node-id requires a value'] };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

  // Determine mode.
  let mode;
  if (hasNodeIdFlag && hasStart) {
    mode = 'per-node-start';
  } else if (hasNodeIdFlag) {
    mode = 'per-node';
  } else {
    mode = 'whole-plan';
  }

  let recordBase = null;
  let barrierCheck = null;
  let gateVerify = null;
  let verdictCheck = null;
  let selectorCheck = null;

  if (mode === 'per-node-start') {
    // Shell: --record-base --node-id ID --json
    recordBase = shellValidator(validatorPath, planPath, ['--record-base', '--node-id', nodeIdValue, '--json']);
  } else if (mode === 'per-node') {
    // Shell: --barrier-check --node-id ID --json
    barrierCheck = shellValidator(validatorPath, planPath, ['--barrier-check', '--node-id', nodeIdValue, '--json']);
    // Shell: --gate-verify --json (informational only — do not short-circuit on failure)
    gateVerify = shellValidator(validatorPath, planPath, ['--gate-verify', '--json']);
    // Shell: --verdict-check --node-id ID --json (informational only — no deadlock when reviewer hasn't run)
    verdictCheck = shellValidator(validatorPath, planPath, ['--verdict-check', '--node-id', nodeIdValue, '--json']);
    // #263: selector-check ID --json. BLOCKING per-node (checks the COMPLETING node's OWN
    // .cache, like barrier-check — no deadlock risk, so NOT informational). A non-selector
    // node returns isSelector:false/ok:true (never false-blocks). A selector_source with a
    // missing/foreign selector returns ok:false/exit 1 => fails the commit (fail-closed).
    // NEVER mutates the ledger: on success it RETURNS armsToNa for the contractor to transcribe.
    selectorCheck = shellValidator(validatorPath, planPath, ['--selector-check', '--node-id', nodeIdValue, '--json']);
  } else {
    // whole-plan: shell --barrier-check --json, --gate-verify --json, --verdict-check --json (all blocking)
    barrierCheck = shellValidator(validatorPath, planPath, ['--barrier-check', '--json']);
    gateVerify = shellValidator(validatorPath, planPath, ['--gate-verify', '--json']);
    verdictCheck = shellValidator(validatorPath, planPath, ['--verdict-check', '--json']);
  }

  const out = combineResults({ recordBase, barrierCheck, gateVerify, verdictCheck, selectorCheck }, { mode, nodeId: nodeIdValue });
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = out.overallOk ? 0 : 1;
}

if (require.main === module) {
  main();
}

module.exports = { combineResults, shellValidator };
