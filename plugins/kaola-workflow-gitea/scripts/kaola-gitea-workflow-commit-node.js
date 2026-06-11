#!/usr/bin/env node
// @generated from scripts/kaola-workflow-commit-node.js by `npm run sync:editions` (issue #365) — edit canonical and regenerate; do NOT hand-edit this forge port.
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-commit-node.js (issue #242)
//
// Aggregator: per-node / whole-plan barrier entry point.
// Composes the plan-validator subcommands into one auditable call — it SHELLS
// the validator; it does NOT reimplement it.
//
// argv: node kaola-gitea-workflow-commit-node.js <plan-path> [--node-id <id>] [--start] --json
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
// #366: test-only validator-path override so a spawn-count test can point at a logging stub.
const validatorPath = process.env.KAOLA_COMMIT_NODE_VALIDATOR || path.join(__dirname, VALIDATOR);

// ---------------------------------------------------------------------------
// safeJsonParse — returns {} on any parse failure (fail-closed).
// ---------------------------------------------------------------------------
function safeJsonParse(str) {
  const s = String(str || '');
  // Fast path: the whole payload is one JSON document.
  try { return JSON.parse(s); } catch (_) {}
  // #355: otherwise parse the LAST line that is valid JSON — a stray log/debug/warning line
  // emitted before the framed JSON must NOT turn a success into an empty {} (treated as a refusal).
  // #403.1: a trailing non-object JSON scalar (`true`/`42`/`null`) must NOT win and get spread into
  // `{...scalar, exitCode:0}` (flattening a success into a refusal); only an object (non-null)
  // payload is a valid framed result line — keep scanning past a scalar/array.
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch (_) {}
  }
  return {};
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
    // #355: exitCode is a RESERVED key set LAST — a payload field named exitCode can never clobber
    // the real process exit status.
    return { ...safeJsonParse(stdout), exitCode: 0 };
  } catch (err) {
    // The validator writes valid JSON to stdout even on exit 1; read err.stdout.
    const status = (err.status == null) ? 1 : err.status; // fail-closed on signal kill
    return { ...safeJsonParse(err.stdout), exitCode: status };
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
      'usage: kaola-gitea-workflow-commit-node.js <plan-path> [--node-id <id>] [--start] --json\n' +
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
    // #366: ONE fused validator spawn (--node-end) replaces the four separate barrier/gate/verdict/
    // selector spawns. The fused envelope carries the same per-check payloads; we synthesize the
    // per-check exitCode each separate spawn would have set so combineResults is unchanged.
    const fused = shellValidator(validatorPath, planPath, ['--node-end', '--node-id', nodeIdValue, '--json']);
    if (fused && fused.mode === 'node-end') {
      const withExit = (sub, ok) => (sub == null) ? sub : Object.assign({}, sub, { exitCode: ok ? 0 : 1 });
      barrierCheck = withExit(fused.barrierCheck, fused.barrierCheck && fused.barrierCheck.result === 'pass');
      gateVerify = withExit(fused.gateVerify, fused.gateVerify && fused.gateVerify.ok === true);
      verdictCheck = withExit(fused.verdictCheck, fused.verdictCheck && fused.verdictCheck.ok === true);
      selectorCheck = withExit(fused.selectorCheck, fused.selectorCheck && fused.selectorCheck.ok === true);
    } else {
      // Fallback (older validator without --node-end, or a parse miss): the legacy four spawns.
      barrierCheck = shellValidator(validatorPath, planPath, ['--barrier-check', '--node-id', nodeIdValue, '--json']);
      gateVerify = shellValidator(validatorPath, planPath, ['--gate-verify', '--json']);
      verdictCheck = shellValidator(validatorPath, planPath, ['--verdict-check', '--node-id', nodeIdValue, '--json']);
      selectorCheck = shellValidator(validatorPath, planPath, ['--selector-check', '--node-id', nodeIdValue, '--json']);
    }
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
