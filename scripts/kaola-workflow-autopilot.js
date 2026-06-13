#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-autopilot.js (issue #443 — D-420 P1)
//
// Autopilot driver: stateless receipt-reader that advances a multi-stage
// kaola workflow (scout → claim → plan → run → finalize) by inspecting
// on-disk receipts and emitting the next stage descriptor or a typed stop.
//
// Usage:
//   node kaola-workflow-autopilot.js next --goal <text> [options]
//   node kaola-workflow-autopilot.js digest --project <name> --stage <s> --result <r> [options]
//
// Subcommands:
//   next     Emit the next stage descriptor or stop payload (exit 0 on both).
//            --goal <text>         (required) The operator's goal text.
//            --project <name>      Project name (required once active).
//            --scout-result <path> Path to scout JSON (required to advance past scout).
//            --json                Emit JSON to stdout.
//
//   digest   Append one transition line to the autopilot-digest.jsonl log.
//            --project <name>      Project name.
//            --stage <s>           Stage name (scout|claim|plan|run|finalize).
//            --result <r>          Transition result string.
//            --receipt-path <path> (optional) Receipt file path.
//            --repair <json>       (optional) Repair descriptor JSON string.
//            --json                Emit JSON echo of the appended line.
//
// Stop payload: {stop, stage, project, details:{...}, receipt_path}
// Stop reasons: goal_satisfied | backlog_empty | consent_halt | security_halt |
//               typed_refusal | repair_limit
//
// Repair consent: KAOLA_AUTOPILOT_REPAIR ∈ {ask(default), auto}
//   Mechanical kinds (auto-applicable): add_to_write_set | write_set_swap
//   Always halt: revert_overflow | unclassified | absent proposed_repair
//   Bounded: 1 auto-repair per node; 2nd same-node barrier_failed → repair_limit
//
// FORGE-NEUTRAL: this file carries no forge-specific CLI tokens and makes no
// forge API calls. The codex plugin copy is byte-identical; the gitlab/gitea
// ports are rename-normalised identical.
// ---------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGES = ['scout', 'claim', 'plan', 'run', 'finalize'];

// Mechanical (auto-applicable) repair kinds per spec (OQ-2).
const MECHANICAL_KINDS = new Set(['add_to_write_set', 'write_set_swap']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

// Parse argv in the same style as claim.js (long flags, --flag value / --flag=value, --json bool).
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--json') { args.json = true; continue; }
    if (key === '--repair' && val !== undefined && !val.startsWith('--')) {
      args.repair = val;
      i++;
      continue;
    }
    if (key.startsWith('--') && val !== undefined && !val.startsWith('--')) {
      const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[name] = val;
      i++;
    }
  }
  return args;
}

// Resolve the base directory for kaola-workflow state.
// Uses KAOLA_KW_BASE env if set (for tests), otherwise cwd-derived root.
function resolveKwBase() {
  if (process.env.KAOLA_KW_BASE) return process.env.KAOLA_KW_BASE;
  // Walk up from cwd to find kaola-workflow dir.
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'kaola-workflow'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function projectCacheDir(base, project) {
  return path.join(base, 'kaola-workflow', project, '.cache');
}

function projectDir(base, project) {
  return path.join(base, 'kaola-workflow', project);
}

function digestPath(base, project) {
  return path.join(projectCacheDir(base, project), 'autopilot-digest.jsonl');
}

// ISO timestamp with milliseconds stripped (spec: .replace(/\.\d{3}Z$/,'Z')).
function nowTs() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Emit JSON to stdout.
function emitJSON(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// Append one line to the digest JSONL file (crash-safe: append-only).
function appendDigest(base, project, line) {
  const dir = projectCacheDir(base, project);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(digestPath(base, project), JSON.stringify(line) + '\n', 'utf8');
}

// Read the last non-empty JSON line from the digest (crash-resume via replay).
function readLastDigestLine(base, project) {
  const dp = digestPath(base, project);
  try {
    const content = fs.readFileSync(dp, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]); } catch (_) {}
    }
  } catch (_) {}
  return null;
}

// Read ALL digest lines (for repair-limit check).
function readAllDigestLines(base, project) {
  const dp = digestPath(base, project);
  try {
    const content = fs.readFileSync(dp, 'utf8');
    return content.split('\n').filter(l => l.trim()).map(l => {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
}

// Read a JSON receipt file; returns null on any error.
function readReceipt(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) { return null; }
}

// Read workflow-state.md for escalated_to_full markers.
function readStateMarkers(base, project) {
  const statePath = path.join(projectDir(base, project), 'workflow-state.md');
  let content = '';
  try { content = fs.readFileSync(statePath, 'utf8'); } catch (_) {}
  const matches = [];
  const re = /^escalated_to_full:\s*(.+)$/mg;
  let m;
  while ((m = re.exec(content)) !== null) matches.push(m[1].trim());
  return matches;
}

// Read workflow-plan.md for consent_halt: pending (ledger-scoped).
function readConsentHalt(base, project) {
  const planPath = path.join(projectDir(base, project), 'workflow-plan.md');
  let content = '';
  try { content = fs.readFileSync(planPath, 'utf8'); } catch (_) {}
  return /^consent_halt:[ \t]*pending[ \t]*$/m.test(content);
}

// Read workflow-plan.md ledger to determine allDone (all rows done).
// Returns true only if at least one ledger row exists and all are 'done'.
function readPlanAllDone(base, project) {
  const planPath = path.join(projectDir(base, project), 'workflow-plan.md');
  let content = '';
  try { content = fs.readFileSync(planPath, 'utf8'); } catch (_) { return false; }
  // Locate ## Node Ledger section.
  const ledgerMatch = content.match(/^## Node Ledger\s*\n([\s\S]*?)(?=\n## |$(?![\s\S]))/m);
  if (!ledgerMatch) return false;
  const ledgerSection = ledgerMatch[1];
  // Parse table rows: | id | status | — skip header/separator rows.
  const rows = ledgerSection.split('\n').filter(l => l.trim().startsWith('|'));
  const dataRows = rows.filter(l => !/^\|\s*[-:]+\s*\|/.test(l) && !/^\|\s*id\s*\|/i.test(l));
  if (dataRows.length === 0) return false;
  // Each row: | id | status |
  return dataRows.every(row => {
    const parts = row.split('|').map(s => s.trim()).filter(Boolean);
    return parts.length >= 2 && parts[1] === 'done';
  });
}

// ---------------------------------------------------------------------------
// Stage Machine: determine next stage from digest + on-disk receipts
// ---------------------------------------------------------------------------

// Check for halt conditions (consent/security) during run stage.
// Returns a stop object or null.
function checkRunHalts(base, project) {
  const stateMarkers = readStateMarkers(base, project);
  const consentHalt  = readConsentHalt(base, project);

  if (stateMarkers.length > 0) {
    // Disambiguate: consent halt writes BOTH consent+security markers AND consent_halt:pending.
    // If consent_halt:pending is also present → consent_halt; security-only → security_halt.
    const hasConsent  = stateMarkers.includes('consent');
    const hasSecurity = stateMarkers.includes('security');

    if (consentHalt) {
      // Durable consent halt in ledger → consent_halt regardless of state markers.
      return { stop: 'consent_halt' };
    }
    if (hasConsent && hasSecurity) {
      // Both written by a consent halt, but no ledger marker → still consent_halt.
      return { stop: 'consent_halt' };
    }
    if (hasSecurity) {
      return { stop: 'security_halt' };
    }
  }
  if (consentHalt) {
    return { stop: 'consent_halt' };
  }
  return null;
}

// Check for barrier_failed receipt during run stage.
// Returns descriptor or stop depending on repair policy.
function checkBarrierFailed(base, project, goal, repairMode) {
  const barrierPath = path.join(projectCacheDir(base, project), 'barrier-failed.json');
  const barrierReceipt = readReceipt(barrierPath);
  if (!barrierReceipt || barrierReceipt.result !== 'barrier_failed') return null;

  const triage = barrierReceipt.triage || null;
  const nodeId = barrierReceipt.node_id || null;
  const proposedRepair = triage && triage.proposed_repair;
  const repairKind = proposedRepair && proposedRepair.kind;

  // Determine if this repair is mechanical (auto-applicable).
  const isMechanical = !!(repairKind && MECHANICAL_KINDS.has(repairKind));

  if (repairMode === 'auto' && isMechanical) {
    // Check repair_limit: if a repair_applied already exists for this same node → repair_limit.
    const allLines = readAllDigestLines(base, project);
    const priorRepairForNode = allLines.find(
      l => l.result === 'repair_applied' && l.repair && l.repair.node === nodeId
    );
    if (priorRepairForNode) {
      return {
        stop: 'repair_limit',
        details: {
          node: nodeId,
          attempts: 2,
          triage,
        },
      };
    }
    // Apply mechanical repair: return run descriptor with repair field + log digest.
    const repair = {
      kind: repairKind,
      node: nodeId,
      paths: proposedRepair.paths || [],
    };
    return {
      descriptor: {
        stage: 'run',
        action: 'run_plan',
        project,
        goal,
        repair,
        receipt_path: barrierPath,
      },
      digestEntry: {
        ts: nowTs(),
        stage: 'run',
        result: 'repair_applied',
        receipt_path: barrierPath,
        repair,
      },
    };
  }

  // ask mode or non-mechanical kind → typed_refusal.
  return {
    stop: 'typed_refusal',
    details: {
      triage,
      node: nodeId,
      reason: triage && triage.class ? triage.class : 'barrier_failed',
    },
  };
}

// ---------------------------------------------------------------------------
// cmdNext — main next-stage computation
// ---------------------------------------------------------------------------

function cmdNext(args, asJson) {
  const goal = args.goal;
  if (!goal) {
    const err = { error: 'missing_required_arg', arg: '--goal' };
    if (asJson) emitJSON(err);
    else process.stderr.write('autopilot: --goal is required\n');
    process.exit(1);
  }

  const project = args.project || null;
  const scoutResultPath = args.scoutResult || null;
  const base = resolveKwBase();
  const repairMode = (process.env.KAOLA_AUTOPILOT_REPAIR || 'ask').toLowerCase();

  // Validate project name if provided.
  if (project !== null && !isSafeName(project)) {
    const err = { error: 'unsafe_project_name', project };
    if (asJson) emitJSON(err);
    else process.stderr.write('autopilot: unsafe project name: ' + project + '\n');
    process.exit(1);
  }

  // Read last digest line to determine current stage.
  const lastLine = project ? readLastDigestLine(base, project) : null;
  const currentStage = lastLine ? lastLine.stage : null;

  // ── Stage: scout ───────────────────────────────────────────────────────
  if (!currentStage || currentStage === 'scout' && lastLine.result !== 'advanced') {
    // Cold start or scout not yet advanced.
    // If scout-result provided, parse it.
    if (scoutResultPath) {
      const scoutData = readReceipt(scoutResultPath);
      if (!scoutData) {
        const err = { error: 'scout_result_unreadable', path: scoutResultPath };
        if (asJson) emitJSON(err);
        process.exit(1);
      }
      if (scoutData.backlog_empty === true && scoutData.recommended_bundle === null) {
        const stop = {
          stop: 'backlog_empty',
          stage: 'scout',
          project,
          details: {},
          receipt_path: scoutResultPath,
        };
        if (asJson) emitJSON(stop);
        process.exit(0);
      }
      // scout done → claim
      const bundle = scoutData.recommended_bundle || {};
      const descriptor = {
        stage: 'claim',
        action: 'claim_bundle',
        project,
        goal,
        inputs: {
          issues: bundle.issues || [],
          title: bundle.title || null,
        },
        receipt_path: scoutResultPath,
      };
      if (asJson) emitJSON(descriptor);
      process.exit(0);
    }
    // No scout-result → dispatch scout.
    const descriptor = {
      stage: 'scout',
      action: 'dispatch_issue_scout',
      project,
      goal,
      inputs: {},
      receipt_path: null,
    };
    if (asJson) emitJSON(descriptor);
    process.exit(0);
  }

  // ── Advance based on last completed stage ──────────────────────────────
  if (currentStage === 'scout' && lastLine.result === 'advanced') {
    // Scout advanced → need scout-result to transition to claim.
    if (scoutResultPath) {
      const scoutData = readReceipt(scoutResultPath);
      if (!scoutData) {
        const err = { error: 'scout_result_unreadable', path: scoutResultPath };
        if (asJson) emitJSON(err);
        process.exit(1);
      }
      if (scoutData.backlog_empty === true && scoutData.recommended_bundle === null) {
        const stop = {
          stop: 'backlog_empty',
          stage: 'scout',
          project,
          details: {},
          receipt_path: scoutResultPath,
        };
        if (asJson) emitJSON(stop);
        process.exit(0);
      }
      const bundle = scoutData.recommended_bundle || {};
      const descriptor = {
        stage: 'claim',
        action: 'claim_bundle',
        project,
        goal,
        inputs: {
          issues: bundle.issues || [],
          title: bundle.title || null,
        },
        receipt_path: scoutResultPath,
      };
      if (asJson) emitJSON(descriptor);
      process.exit(0);
    }
    // No scout-result yet → re-emit scout.
    const descriptor = {
      stage: 'scout',
      action: 'dispatch_issue_scout',
      project,
      goal,
      inputs: {},
      receipt_path: null,
    };
    if (asJson) emitJSON(descriptor);
    process.exit(0);
  }

  if (currentStage === 'claim' && lastLine.result === 'advanced') {
    const descriptor = {
      stage: 'plan',
      action: 'dispatch_planner',
      project,
      goal,
      inputs: {},
      receipt_path: null,
    };
    if (asJson) emitJSON(descriptor);
    process.exit(0);
  }

  if (currentStage === 'plan' && lastLine.result === 'advanced') {
    const descriptor = {
      stage: 'run',
      action: 'run_plan',
      project,
      goal,
      inputs: {},
      receipt_path: null,
    };
    if (asJson) emitJSON(descriptor);
    process.exit(0);
  }

  if (currentStage === 'run') {
    // Check halt conditions first (highest precedence).
    const halt = checkRunHalts(base, project);
    if (halt) {
      const stop = Object.assign({ stage: 'run', project, details: {}, receipt_path: null }, halt);
      if (asJson) emitJSON(stop);
      process.exit(0);
    }

    // Check barrier_failed.
    const barrierResult = checkBarrierFailed(base, project, goal, repairMode);
    if (barrierResult) {
      if (barrierResult.stop) {
        const stop = Object.assign({ stage: 'run', project, details: {}, receipt_path: null }, barrierResult);
        if (asJson) emitJSON(stop);
        process.exit(0);
      }
      if (barrierResult.descriptor) {
        // Log repair_applied to digest.
        appendDigest(base, project, barrierResult.digestEntry);
        if (asJson) emitJSON(barrierResult.descriptor);
        process.exit(0);
      }
    }

    // Check if allDone via plan ledger.
    const allDone = readPlanAllDone(base, project);
    if (allDone) {
      const descriptor = {
        stage: 'finalize',
        action: 'sink',
        project,
        goal,
        inputs: {},
        receipt_path: null,
      };
      if (asJson) emitJSON(descriptor);
      process.exit(0);
    }

    // Still running → re-emit run.
    const descriptor = {
      stage: 'run',
      action: 'run_plan',
      project,
      goal,
      inputs: {},
      receipt_path: null,
    };
    if (asJson) emitJSON(descriptor);
    process.exit(0);
  }

  if (currentStage === 'finalize') {
    // Check sink-receipt: steps.push_main === 'done'
    const cacheDir = projectCacheDir(base, project);
    const sinkReceiptPath = path.join(cacheDir, 'sink-receipt.json');
    const sinkReceipt = readReceipt(sinkReceiptPath);

    const sinkDone = !!(sinkReceipt && sinkReceipt.steps && sinkReceipt.steps.push_main === 'done');

    if (!sinkDone) {
      // Sink not complete → re-emit finalize.
      const descriptor = {
        stage: 'finalize',
        action: 'sink',
        project,
        goal,
        inputs: {},
        receipt_path: sinkReceiptPath,
      };
      if (asJson) emitJSON(descriptor);
      process.exit(0);
    }

    // Sink done → check goal_check from finalize stdout receipt.
    const finalizeReceiptPath = path.join(cacheDir, 'finalize-stdout.json');
    const finalizeReceipt = readReceipt(finalizeReceiptPath);
    const goalCheck = finalizeReceipt &&
      finalizeReceipt.closure_receipt &&
      finalizeReceipt.closure_receipt.goal_check;

    if (goalCheck === 'satisfied') {
      const stop = {
        stop: 'goal_satisfied',
        stage: 'finalize',
        project,
        details: { goal_check: goalCheck },
        receipt_path: sinkReceiptPath,
      };
      if (asJson) emitJSON(stop);
      process.exit(0);
    }

    // goal_check absent or not satisfied → goal_progress.
    const result = {
      result: 'goal_progress',
      stage: 'finalize',
      project,
      goal_check: goalCheck || 'absent',
      receipt_path: sinkReceiptPath,
    };
    if (asJson) emitJSON(result);
    process.exit(0);
  }

  // Fallthrough: unknown stage state → typed_refusal.
  const err = {
    stop: 'typed_refusal',
    stage: currentStage,
    project,
    details: { reason: 'unknown_stage', stage: currentStage },
    receipt_path: null,
  };
  if (asJson) emitJSON(err);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// cmdDigest — append a transition line to the digest
// ---------------------------------------------------------------------------

function cmdDigest(args, asJson) {
  const project = args.project || null;
  const stage   = args.stage || null;
  const result  = args.result || null;
  const receiptPath = args.receiptPath || null;
  let repair = null;

  if (args.repair) {
    try { repair = JSON.parse(args.repair); } catch (_) { repair = null; }
  }

  if (project !== null && !isSafeName(project)) {
    const err = { error: 'unsafe_project_name', project };
    if (asJson) emitJSON(err);
    else process.stderr.write('autopilot: unsafe project name\n');
    process.exit(1);
  }

  const base = resolveKwBase();

  const line = {
    ts: nowTs(),
    stage,
    result,
    receipt_path: receiptPath || null,
  };
  if (repair) line.repair = repair;

  if (project) {
    appendDigest(base, project, line);
  }

  if (asJson) emitJSON(line);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

const sub = process.argv[2];
const rawArgs = parseArgs(process.argv.slice(3));
const asJson = !!rawArgs.json;

if (sub === 'next') {
  cmdNext(rawArgs, asJson);
} else if (sub === 'digest') {
  cmdDigest(rawArgs, asJson);
} else {
  const err = { error: 'unknown_subcommand', subcommand: sub || null };
  if (asJson) emitJSON(err);
  else process.stderr.write('autopilot: unknown subcommand: ' + (sub || '(none)') + '\n');
  process.exit(1);
}
