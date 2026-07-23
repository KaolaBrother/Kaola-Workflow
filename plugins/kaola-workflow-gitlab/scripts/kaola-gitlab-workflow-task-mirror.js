#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-task-mirror.js (issue #266 AC-C)
//
// Generates the durable kaola-workflow/{project}/workflow-tasks.json from the
// frozen ## Nodes + ## Node Ledger sections of workflow-plan.md.
//
// Reuses planNodesWithExpansions, parseLedger, readStoredHash from the plan-validator (#763: the
// EXECUTION view, so a composed expansion's units are listed too — not just the frozen spine).
// Does NOT re-implement table parsing.
//
// CLI:
//   node kaola-workflow-task-mirror.js --project <name> [--now <iso>] [--json]
//
// Exported API (deterministic, clock-free core):
//   module.exports = { generateMirror, mapLedgerStatus }
//
// Exit 0 on write, non-zero typed refusal on missing/unfrozen plan.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { planNodesWithExpansions, parseLedger, readStoredHash } = require('./kaola-gitlab-workflow-plan-validator');
// #355: the shared emit/refuse protocol. Refusals go to STDOUT (one compact JSON line)
// so a caller that parses stdout still recovers the `reason` — the old stderr refusals
// were invisible to adaptive-node's shellNode (which reads err.stdout). adaptive-schema is
// byte-identical across every edition, so this require is NOT forge-renamed.
const { emit, refuse } = require('./kaola-workflow-adaptive-schema');

/**
 * Resolve the repository root using git, falling back to process.cwd().
 * Uses the same pattern as kaola-workflow-active-folders.js (getRoot).
 * This ensures the CLI resolves kaola-workflow/<project>/ correctly
 * regardless of which tree this script is installed in.
 */
function getRepoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

/**
 * Map a raw ledger status value to the UI-facing status string.
 * Conservative default: unknown/absent -> 'pending'.
 *
 * @param {string|undefined} ledgerStatus - Raw ledger value (already lowercased by parseLedger)
 * @returns {string} UI-facing status
 */
function mapLedgerStatus(ledgerStatus) {
  switch (ledgerStatus) {
    case 'complete':     return 'completed';
    case 'in_progress':  return 'in_progress';
    case 'pending':      return 'pending';
    case 'n/a':          return 'completed';
    default:             return 'pending';
  }
}

/**
 * Pure, clock-free core generator. Takes plan content and an injected `now`
 * timestamp so callers can test deterministically.
 *
 * @param {{ planContent: string, now: string }} opts
 * @returns {object} Either the mirror object or { status: 'plan_not_frozen' }
 */
function generateMirror({ planContent, now }) {
  const sourceHash = readStoredHash(planContent);
  if (!sourceHash) {
    return { status: 'plan_not_frozen' };
  }

  const nodes = planNodesWithExpansions(planContent);
  const ledger = parseLedger(planContent);

  const tasks = nodes.map(node => {
    const rawStatus = ledger.has(node.id) ? ledger.get(node.id) : undefined;
    return {
      id: node.id,
      role: node.role,
      status: mapLedgerStatus(rawStatus),
      ledger_status: rawStatus !== undefined ? rawStatus : 'pending',
    };
  });

  return {
    source_plan_hash: sourceHash,
    tasks,
    last_synced_from_ledger: now,
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper — stamps clock at the outermost layer only (when --now is absent)
// ---------------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);

  let project = null;
  let nowArg = null;
  let jsonFlag = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { project = args[++i]; }
    else if (args[i] === '--now' && args[i + 1]) { nowArg = args[++i]; }
    else if (args[i] === '--json') { jsonFlag = true; }
  }

  if (!project) {
    emit(refuse('missing_arg', { status: 'missing_arg', message: 'Usage: node kaola-workflow-task-mirror.js --project <name> [--now <iso>] [--json]' }));
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const planPath = path.join(repoRoot, 'kaola-workflow', project, 'workflow-plan.md');
  const outPath  = path.join(repoRoot, 'kaola-workflow', project, 'workflow-tasks.json');

  let planContent;
  try {
    planContent = fs.readFileSync(planPath, 'utf8');
  } catch (e) {
    emit(refuse('plan_not_found', { status: 'plan_not_found', path: planPath, message: e.message }));
    process.exit(1);
  }

  // Stamp clock at the outermost layer only — the core function is clock-free.
  const now = nowArg || new Date().toISOString();

  const result = generateMirror({ planContent, now });

  if (result.status === 'plan_not_frozen') {
    emit(refuse('plan_not_frozen', result));
    process.exit(1);
  }

  const json = JSON.stringify(result, null, 2) + '\n';
  // #671: writeFileSync can throw (e.g. EISDIR when outPath collides with a directory). A mirror
  // write must never crash with a raw multi-line stack trace — that noise can mask a real failure
  // in a long log AND leaves a production collision silently unobservable beyond stderr noise. Fail
  // CLOSED here with the SAME concise one-line machine envelope every other refusal in this CLI
  // uses; the mirror write itself stays fail-OPEN end-to-end because refreshTaskMirror (the caller,
  // in kaola-workflow-adaptive-node.js) already swallows this non-zero exit and reads the `reason`
  // off stdout (the #355 mechanism) — a mirror-write failure still never blocks a run.
  try {
    fs.writeFileSync(outPath, json, 'utf8');
  } catch (e) {
    emit(refuse('mirror_write_failed', { status: 'mirror_write_failed', path: outPath, message: e.message }));
    process.exit(1);
  }

  if (jsonFlag) {
    process.stdout.write(json);
  }

  process.exit(0);
}

module.exports = { generateMirror, mapLedgerStatus };
