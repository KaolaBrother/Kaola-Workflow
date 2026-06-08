#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-adaptive-node.js (issue #272)
//
// Pure-composition aggregator: owns the per-node adaptive lifecycle for
// /kaola-workflow-plan-run. Shells the frozen-core scripts via child_process
// and never imports-and-mutates them.
//
// Subcommands (all require --project P and --json; exit≠0 on refuse):
//   orient         --project P                        (READ-ONLY)
//   open-next      --project P [--node-id N]          (MUTATES ledger + baseline)
//   record-evidence --project P --node-id N --stdin   (MUTATES .cache)
//   close-and-open-next --project P --node-id N       (MUTATES ledger + state)
//   write-halt     --project P --node-id N --reason R (MUTATES state + ledger)
//
// Crash-safe write order (binding for all mutation subcommands):
//   .cache evidence  →  ## Node Ledger row  →  workflow-state.md pointer LAST
// ---------------------------------------------------------------------------

const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Sibling-script filename constants — keep each on its own line for forge
// ports that need a one-line rename.
// ---------------------------------------------------------------------------
const COMMIT_NODE  = 'kaola-gitea-workflow-commit-node.js';
const NEXT_ACTION  = 'kaola-gitea-workflow-next-action.js';
const VALIDATOR    = 'kaola-gitea-workflow-plan-validator.js';

const commitNodePath = path.join(__dirname, COMMIT_NODE);
const nextActionPath = path.join(__dirname, NEXT_ACTION);
const validatorPath  = path.join(__dirname, VALIDATOR);

// ---------------------------------------------------------------------------
// getRoot — resolve the user-repo root via git rev-parse (cwd fallback).
// ---------------------------------------------------------------------------
function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// safeJsonParse — returns {} on any parse failure (fail-closed).
// ---------------------------------------------------------------------------
function safeJsonParse(str) {
  try { return JSON.parse(str || ''); } catch (_) { return {}; }
}

// ---------------------------------------------------------------------------
// shellNode — thin seam: execute a Node.js script and return {exitCode,...json}.
// Fail-closed: exitCode 1 + {} on throw with no stdout.
//
// @param {string} scriptPath  absolute path to the script
// @param {string[]} args      CLI args
// @returns {{ exitCode:number, [key:string]: any }}
// ---------------------------------------------------------------------------
function shellNode(scriptPath, args) {
  let stdout;
  try {
    stdout = execFileSync('node', [scriptPath, ...(args || [])], { encoding: 'utf8' });
    return { exitCode: 0, ...safeJsonParse(stdout) };
  } catch (err) {
    const status = (err.status == null) ? 1 : err.status;
    return { exitCode: status, ...safeJsonParse(err.stdout) };
  }
}

// ---------------------------------------------------------------------------
// spliceLedgerNode — rewrite a single node row's status cell in ## Node Ledger.
//
// GUARD: flip ONLY when current status ∈ allowFrom.
// Idempotent: returns alreadyAtTarget:true when current === newStatus.
// Never touches ## Meta / ## Nodes (plan_hash-covered).
//
// @param {string}   content   full plan file content
// @param {string}   nodeId    target node id
// @param {string}   newStatus status to write ('in_progress', 'complete', 'n/a', ...)
// @param {object}   opts      { allowFrom: string[] } — defaults ['pending']
// @returns {{ content:string, changed:boolean, found:boolean, alreadyAtTarget:boolean }}
// ---------------------------------------------------------------------------
function spliceLedgerNode(content, nodeId, newStatus, opts) {
  const allowFrom = (opts && Array.isArray(opts.allowFrom)) ? opts.allowFrom : ['pending'];

  const ledgerMarker = '\n## Node Ledger';
  const ledgerIdx = content.indexOf(ledgerMarker);
  if (ledgerIdx < 0) {
    return { content, changed: false, found: false, alreadyAtTarget: false };
  }

  // Slice the ledger section from its heading to the next ## heading (or EOF).
  const afterLedger = content.indexOf('\n## ', ledgerIdx + 1);
  const ledgerBlock = afterLedger >= 0
    ? content.slice(ledgerIdx, afterLedger)
    : content.slice(ledgerIdx);

  const rows = ledgerBlock.split('\n').filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) {
    return { content, changed: false, found: false, alreadyAtTarget: false };
  }

  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const stIdx = header.indexOf('status');
  if (idIdx < 0 || stIdx < 0) {
    return { content, changed: false, found: false, alreadyAtTarget: false };
  }

  let found = false;
  let changed = false;
  let alreadyAtTarget = false;

  const newLedgerBlock = ledgerBlock.replace(/\n(\|[^\n]+)/g, (match, row) => {
    const cells = row.split('|').slice(1, -1);
    const rowId = (cells[idIdx] || '').trim();
    if (rowId !== nodeId) return match;

    found = true;
    const currentStatus = (cells[stIdx] || '').trim().toLowerCase();

    // Already at the target — idempotent no-op.
    if (currentStatus === newStatus) {
      alreadyAtTarget = true;
      return match;
    }

    // Current status not in allowFrom — refuse to touch.
    if (!allowFrom.includes(currentStatus)) {
      return match;
    }

    // Replace the status cell, preserving surrounding whitespace.
    const origCell = cells[stIdx];
    const leadingSpace  = (origCell.match(/^(\s*)/) || ['', ''])[1];
    const trailingSpace = (origCell.match(/(\s*)$/) || ['', ''])[1];
    const newCell = leadingSpace + newStatus + trailingSpace;
    cells[stIdx] = newCell;
    changed = true;
    return '\n|' + cells.join('|') + '|';
  });

  if (!found) {
    return { content, changed: false, found: false, alreadyAtTarget: false };
  }

  if (!changed && !alreadyAtTarget) {
    // Found but out-of-allowFrom and not at target — no mutation.
    return { content, changed: false, found: true, alreadyAtTarget: false };
  }

  if (!changed) {
    // alreadyAtTarget — content is logically unchanged.
    return { content, changed: false, found: true, alreadyAtTarget: true };
  }

  const newContent = afterLedger >= 0
    ? content.slice(0, ledgerIdx) + newLedgerBlock + content.slice(afterLedger)
    : content.slice(0, ledgerIdx) + newLedgerBlock;

  return { content: newContent, changed: true, found: true, alreadyAtTarget: false };
}

// ---------------------------------------------------------------------------
// spliceComplianceRow — append a row to ## Required Agent Compliance section.
// Creates the section below ## Node Ledger if absent (idempotent creation).
// Format: | Requirement | Status | Evidence | Skip Reason |  (canonical repair-state.js shape)
// ---------------------------------------------------------------------------
function spliceComplianceRow(content, row) {
  const SECTION = '## Required Agent Compliance';
  const HEADER_ROW = '| Requirement | Status | Evidence | Skip Reason |';
  const SEPARATOR  = '|-------------|--------|----------|-------------|';
  const newRow = row;

  if (content.includes(SECTION)) {
    // Append the row just before the next ## heading after the section, or at EOF.
    const sectionIdx = content.indexOf('\n' + SECTION);
    if (sectionIdx < 0) {
      // The section is at the very start (unlikely but handle).
      return content.trimEnd() + '\n' + newRow + '\n';
    }
    const nextSection = content.indexOf('\n## ', sectionIdx + 1);
    if (nextSection >= 0) {
      // Insert before the next section.
      const insertAt = nextSection;
      return content.slice(0, insertAt) + '\n' + newRow + content.slice(insertAt);
    }
    // Append at EOF.
    return content.trimEnd() + '\n' + newRow + '\n';
  }

  // Section absent — create it below ## Node Ledger.
  const ledgerMarker = '\n## Node Ledger';
  const ledgerIdx = content.indexOf(ledgerMarker);
  const afterLedger = ledgerIdx >= 0 ? content.indexOf('\n## ', ledgerIdx + 1) : -1;

  const newSection = '\n' + SECTION + '\n\n' + HEADER_ROW + '\n' + SEPARATOR + '\n' + newRow + '\n';

  if (afterLedger >= 0) {
    return content.slice(0, afterLedger) + newSection + content.slice(afterLedger);
  }
  // No next ## heading after ledger — append at EOF.
  return content.trimEnd() + newSection;
}

// ---------------------------------------------------------------------------
// spliceStateMarker — idempotently write "key: value" into workflow-state.md.
// Inserts before ## Last Updated (if present), else appends.
// ---------------------------------------------------------------------------
function spliceStateMarker(content, key, value) {
  const line = key + ': ' + value;
  // If marker already present with this exact value, no-op.
  const exactRe = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm');
  if (exactRe.test(content)) return content;

  // If marker present with a different value, replace it.
  const anyRe = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*.+$', 'm');
  if (anyRe.test(content)) {
    return content.replace(anyRe, line);
  }

  // Insert before ## Last Updated if present, else append.
  const luMarker = '\n## Last Updated';
  const luIdx = content.indexOf(luMarker);
  if (luIdx >= 0) {
    return content.slice(0, luIdx) + '\n' + line + content.slice(luIdx);
  }

  // Append at EOF.
  return content.trimEnd() + '\n' + line + '\n';
}

// ---------------------------------------------------------------------------
// parseNodesFromContent — read-only require of plan-validator's parseNodes.
// Returns [] on any error (fail-closed).
// ---------------------------------------------------------------------------
function parseNodesFromContent(content) {
  try {
    const { parseNodes } = require('./kaola-gitea-workflow-plan-validator');
    return parseNodes(content);
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// checkEvidenceShape — presence-only check for role-specific evidence tokens.
//
// tdd-guide:   needs BOTH 'RED' AND 'GREEN' (or 'n/a' reason).
// implementer: needs 'non_tdd_reason' AND one of {regression-green, build-green,
//              smoke-integration} (or 'n/a').
// other roles: file present and non-empty is sufficient.
//
// @param {string}      role         node role string
// @param {string}      nodeId       node id (for error context)
// @param {string|null} evidence     evidence file content (null/'' → absent)
// @returns {{ ok:boolean, reason?:string, expected?:string[] }}
// ---------------------------------------------------------------------------
function checkEvidenceShape(role, nodeId, evidence) {
  const content = evidence || '';

  // 'n/a' skip is universal.
  if (content.trim().startsWith('n/a')) {
    return { ok: true };
  }

  if (role === 'tdd-guide') {
    if (!content) {
      return { ok: false, reason: 'evidence missing for tdd-guide node ' + nodeId, expected: ['RED', 'GREEN'] };
    }
    const hasRed   = /\bRED\b/.test(content);
    const hasGreen = /\bGREEN\b/.test(content);
    if (!hasRed) {
      return { ok: false, reason: 'tdd-guide ' + nodeId + ' evidence missing RED token', expected: ['RED', 'GREEN'] };
    }
    if (!hasGreen) {
      return { ok: false, reason: 'tdd-guide ' + nodeId + ' evidence missing GREEN token', expected: ['RED', 'GREEN'] };
    }
    return { ok: true };
  }

  if (role === 'implementer') {
    if (!content) {
      return { ok: false, reason: 'evidence missing for implementer node ' + nodeId, expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    const hasReason = /non_tdd_reason/.test(content);
    const hasChangeType = /regression-green|build-green|smoke-integration/.test(content);
    if (!hasReason) {
      return { ok: false, reason: 'implementer ' + nodeId + ' evidence missing non_tdd_reason', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    if (!hasChangeType) {
      return { ok: false, reason: 'implementer ' + nodeId + ' evidence missing change-type token', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    return { ok: true };
  }

  // Other roles: file present and non-empty.
  if (!content.trim()) {
    return { ok: false, reason: role + ' ' + nodeId + ' evidence missing or empty', expected: ['non-empty evidence file'] };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// runOrient — READ-ONLY orient. No mutations.
//
// Shells VALIDATOR --resume-check + NEXT_ACTION; scans markers in state+plan.
// ---------------------------------------------------------------------------
function runOrient(opts) {
  const { planPath, statePath, shell, readFile, cacheExists } = opts;

  const resumeCheck = shell(validatorPath, [planPath, '--resume-check', '--json']);
  const nextAction  = shell(nextActionPath, [planPath, '--json']);

  // Read state for escalated_to_full marker.
  let stateContent = '';
  try { stateContent = readFile(statePath); } catch (_) {}

  const escalatedMatch = stateContent.match(/^escalated_to_full:\s*(.+)$/m);
  const escalatedToFull = escalatedMatch ? escalatedMatch[1].trim() : null;

  // Read plan for consent_halt: pending in ## Node Ledger.
  let planContent = '';
  try { planContent = readFile(planPath); } catch (_) {}

  const consentHalt = /consent_halt:\s*pending/.test(planContent);

  // Resolve per-node cache (.cache/{id}.md) presence — same check the single-node
  // resume path has always used.
  const cacheStateFor = (rowId) => {
    const cachePath = path.join(path.dirname(planPath), '.cache', rowId + '.md');
    if (cacheExists) {
      return cacheExists(cachePath) ? 'present' : 'absent';
    }
    try { readFile(cachePath); return 'present'; } catch (_) { return 'absent'; }
  };

  // Enumerate ALL in_progress ledger rows (no early break — AC#5 batch awareness).
  const ledgerMarker = '\n## Node Ledger';
  const ledgerIdx = planContent.indexOf(ledgerMarker);
  const inProgressNodes = [];

  if (ledgerIdx >= 0) {
    const afterLedger = planContent.indexOf('\n## ', ledgerIdx + 1);
    const ledgerBlock = afterLedger >= 0
      ? planContent.slice(ledgerIdx, afterLedger)
      : planContent.slice(ledgerIdx);

    const rows = ledgerBlock.split('\n').filter(l => l.trim().startsWith('|'));
    if (rows.length >= 2) {
      const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
      const idIdx = header.indexOf('id');
      const stIdx = header.indexOf('status');
      if (idIdx >= 0 && stIdx >= 0) {
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
          const rowId = cells[idIdx] || '';
          const rowSt = (cells[stIdx] || '').toLowerCase();
          if (rowSt === 'in_progress') {
            inProgressNodes.push(rowId);
          }
        }
      }
    }
  }

  // Keep the existing single-node fields byte-for-byte unchanged: the first
  // (legacy: only) in_progress row + its cache state.
  const inProgressNode = inProgressNodes.length ? inProgressNodes[0] : null;
  const cacheState = inProgressNode ? cacheStateFor(inProgressNode) : null;

  // Read the active-batch manifest directly (READ-ONLY) — matches orient's
  // established "read the durable artifact" pattern (no shelling, no new sibling
  // filename literal so the forge ports stay verbatim copies). Fail-closed to null.
  const manifestPath = path.join(path.dirname(planPath), '.cache', 'active-batch.json');
  let manifest = null;
  const manifestPresent = cacheExists ? cacheExists(manifestPath) : true;
  if (manifestPresent) {
    let raw = null;
    try { raw = readFile(manifestPath); } catch (_) { raw = null; }
    if (raw != null) {
      const parsed = safeJsonParse(raw);
      if (parsed && Array.isArray(parsed.members)) {
        manifest = parsed;
      }
    }
  }

  // Order-independent member-set equality between the manifest and the
  // in_progress rows.
  // R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
  const manifestMemberIds = manifest ? (manifest.members || []).filter(m => !m.sealed).map(m => m.id) : [];
  const setsEqual = (a, b) => {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    return b.every(id => sa.has(id));
  };
  const memberSetEquals = !!manifest && setsEqual(manifestMemberIds, inProgressNodes);

  // -- AC#5 legality gate --------------------------------------------------
  //  ≤1 in_progress (with or without a manifest) → legacy single-node path.
  //  ≥1 in_progress AND manifest member-set EQUALS the in_progress set → valid batch.
  //  >1 in_progress AND (no manifest OR member-set mismatch) → typed refusal.
  let batch = null;

  if (memberSetEquals && inProgressNodes.length >= 1) {
    // Valid active batch.
    batch = {
      state: manifest.state || null,
      members: (manifest.members || []).map(m => ({
        id: m.id,
        cacheState: cacheStateFor(m.id),
        sealed: !!m.sealed,
      })),
    };
  } else if (inProgressNodes.length > 1) {
    // Multiple in_progress rows with no valid active batch — orphan/repair state.
    return {
      result: 'refuse',
      reason: 'orphan_multi_in_progress',
      resumeCheck,
      nextAction,
      consentHalt,
      escalatedToFull,
      inProgressNode,
      cacheState,
      inProgressNodes,
      manifest,
      batch: null,
      allDone: false,
    };
  }

  const allDone = !!(nextAction.result === 'ok' && nextAction.allDone);

  // #303 (sub-gap C): START-frontier batch signal. When NOTHING is in_progress (a fresh
  // frontier at startup/resume) and the ready-pending set has >= 2 own-pending siblings, the
  // plan STARTS with a fan-out — signal enterBatch so the orchestrator opens a batch instead
  // of single-opening one node and serializing the rest. Suppressed once any node is in_progress
  // (mid-node / active batch) and when allDone.
  const startReadyPending = (nextAction.result === 'ok' && Array.isArray(nextAction.readyPending))
    ? nextAction.readyPending : [];
  const enterBatch = !allDone && inProgressNodes.length === 0 && startReadyPending.length >= 2;

  return {
    result: 'ok',
    resumeCheck,
    nextAction,
    consentHalt,
    escalatedToFull,
    inProgressNode,
    cacheState: inProgressNode ? cacheState : null,
    inProgressNodes,
    batch,
    allDone,
    enterBatch,
    frontier: enterBatch
      ? startReadyPending.map(n => ({ id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set }))
      : [],
  };
}

// ---------------------------------------------------------------------------
// runOpenNext — MUTATES ledger + baseline.
// Opens the next ready node (or a specified --node-id) in the ledger and
// records its per-node baseline.
// ---------------------------------------------------------------------------
function runOpenNext(opts) {
  const { planPath, statePath, nodeId: requestedId, shell, readFile, writeFile } = opts;

  // Shell NEXT_ACTION.
  const nextAction = shell(nextActionPath, [planPath, '--json']);

  if (nextAction.exitCode !== 0 || nextAction.result !== 'ok') {
    return { result: 'refuse', reason: 'next_action_failed', nextAction };
  }

  if (nextAction.allDone) {
    return { result: 'ok', allDone: true, opened: null };
  }

  // Determine the node to open.
  const readySet = nextAction.readySet || [];
  let targetNode;

  if (requestedId) {
    targetNode = readySet.find(n => n.id === requestedId);
    if (!targetNode) {
      return {
        result: 'refuse',
        reason: 'node_not_ready',
        nodeId: requestedId,
        readySet: readySet.map(n => n.id),
      };
    }
  } else {
    targetNode = nextAction.nextNode;
    if (!targetNode) {
      return { result: 'refuse', reason: 'no_ready_node', nextAction };
    }
  }

  // spliceLedgerNode: pending → in_progress.
  let planContent = readFile(planPath);
  const spliceResult = spliceLedgerNode(planContent, targetNode.id, 'in_progress', { allowFrom: ['pending'] });

  if (!spliceResult.found) {
    return { result: 'refuse', reason: 'node_not_in_ledger', nodeId: targetNode.id };
  }

  // Write updated plan (ledger row updated).
  if (spliceResult.changed) {
    writeFile(planPath, spliceResult.content);
    planContent = spliceResult.content;
  }
  // If alreadyAtTarget (already in_progress), skip the write — idempotent.

  // Shell COMMIT_NODE --node-id <id> --start --json (record baseline).
  const baselineResult = shell(commitNodePath, [planPath, '--node-id', targetNode.id, '--start', '--json']);
  const baselineOk = baselineResult.exitCode === 0 && baselineResult.result === 'ok';

  if (!baselineOk) {
    return {
      result: 'refuse',
      reason: 'baseline_failed',
      nodeId: targetNode.id,
      baselineResult,
    };
  }

  return {
    result: 'ok',
    allDone: false,
    opened: {
      id: targetNode.id,
      role: targetNode.role,
      model: targetNode.model,
      declared_write_set: targetNode.declared_write_set,
    },
    baselineRecorded: true,
  };
}

// ---------------------------------------------------------------------------
// runRecordEvidence — MUTATES .cache.
// Reads stdin content and writes verbatim to .cache/<nodeId>.md.
// ---------------------------------------------------------------------------
function runRecordEvidence(opts) {
  const { planPath, nodeId, stdinContent, writeFile, mkdirp } = opts;

  const cacheDir = path.join(path.dirname(planPath), '.cache');
  const cachePath = path.join(cacheDir, nodeId + '.md');

  if (mkdirp) mkdirp(cacheDir);

  writeFile(cachePath, stdinContent);

  return {
    result: 'ok',
    wrote: cachePath,
    bytes: stdinContent.length,
  };
}

// ---------------------------------------------------------------------------
// runCloseAndOpenNext — the main per-node commit + fused advance.
// Order: (a) evidence-shape → (b) barrier → (c) close+compliance → (e) selector → (d) fused-advance
// ---------------------------------------------------------------------------
function runCloseAndOpenNext(opts) {
  const { planPath, statePath, nodeId, shell, readFile, writeFile, cacheExists } = opts;

  // -- (a) Evidence-shape PRESENCE check ----------------------------------
  // Resolve role via parseNodes (read-only).
  const planContent = readFile(planPath);
  const nodes = parseNodesFromContent(planContent);
  const nodeInfo = nodes.find(n => n.id === nodeId);
  const role = nodeInfo ? nodeInfo.role : 'unknown';

  const cachePath = path.join(path.dirname(planPath), '.cache', nodeId + '.md');

  let evidenceContent = null;
  const evidencePresent = cacheExists ? cacheExists(cachePath) : (() => {
    try { evidenceContent = readFile(cachePath); return true; } catch (_) { return false; }
  })();

  if (evidencePresent && evidenceContent === null) {
    try { evidenceContent = readFile(cachePath); } catch (_) { evidenceContent = ''; }
  }

  const shapeCheck = checkEvidenceShape(role, nodeId, evidenceContent);

  if (!evidencePresent || !shapeCheck.ok) {
    return {
      result: 'refuse',
      reason: 'evidence_missing',
      nodeId,
      role,
      expected: shapeCheck.expected || [],
      detail: shapeCheck.reason || (evidencePresent ? 'shape invalid' : 'cache file absent'),
    };
  }

  // -- (b) Shell COMMIT_NODE per-node barrier ----------------------------
  const barrierOut = shell(commitNodePath, [planPath, '--node-id', nodeId, '--json']);

  if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
    return {
      result: 'refuse',
      reason: 'barrier_failed',
      nodeId,
      barrierOut,
    };
  }

  // -- (c) Close: spliceLedgerNode + compliance row ----------------------
  // Re-read plan (baseline call in open-next may have written it).
  let currentPlan = readFile(planPath);

  const newStatus = 'complete'; // (n/a handled via allowFrom extension if needed)
  const closeResult = spliceLedgerNode(currentPlan, nodeId, newStatus, { allowFrom: ['in_progress', 'n/a'] });

  if (closeResult.changed) {
    currentPlan = closeResult.content;
  }

  // Build compliance row.
  // code-reviewer / security-reviewer → bare role string in Requirement cell.
  const bareRoles = ['code-reviewer', 'security-reviewer'];
  const requirementCell = bareRoles.includes(role)
    ? role
    : role + ' (' + nodeId + ')';

  const evidenceSummary = evidenceContent
    ? evidenceContent.split('\n')[0].slice(0, 80)
    : 'evidence present';

  const complianceRow = '| ' + requirementCell + ' | subagent-invoked | ' + evidenceSummary + ' | |';
  currentPlan = spliceComplianceRow(currentPlan, complianceRow);

  // Write the plan now (ledger + compliance — all non-state writes).
  writeFile(planPath, currentPlan);

  // -- (e) Selector routing (BEFORE fused advance) -----------------------
  const selectorCheck = barrierOut.selectorCheck || {};

  if (selectorCheck.isSelector === true) {
    if (selectorCheck.ok === false) {
      return {
        result: 'refuse',
        reason: 'selector_invalid',
        nodeId,
        selectorCheck,
      };
    }
    // ok === true: write armsToNa.
    const armsToNa = selectorCheck.armsToNa || [];
    let planForSelector = readFile(planPath);
    for (const armId of armsToNa) {
      const armResult = spliceLedgerNode(planForSelector, armId, 'n/a', { allowFrom: ['pending', 'in_progress'] });
      if (armResult.changed) {
        planForSelector = armResult.content;
      }
    }
    writeFile(planPath, planForSelector);
    currentPlan = planForSelector;
  }

  // -- (d) Fused advance -------------------------------------------------
  const nextAction = shell(nextActionPath, [planPath, '--json']);

  if (nextAction.result !== 'ok') {
    // Barrier passed and node is closed, but next-action failed — report partially done.
    return {
      result: 'ok',
      closed: nodeId,
      opened: null,
      allDone: false,
      nextActionError: nextAction,
    };
  }

  if (nextAction.allDone) {
    return { result: 'ok', closed: nodeId, opened: null, allDone: true };
  }

  // #303 (gap #2 / sub-gap C): SCHEDULER-AWARE fused advance. When closing this node
  // exposes a frontier of >= 2 own-pending ready siblings, that is a fan-out — do NOT
  // single-open one node (which would serialize an independent fan-out behind one member).
  // Signal enterBatch so the orchestrator routes to the bounded batch scheduler (open-batch
  // + rolling top-up). Linear chains (readyPending < 2) keep the serial single-open below.
  const readyPending = nextAction.readyPending || [];
  if (readyPending.length >= 2) {
    return {
      result: 'ok',
      closed: nodeId,
      opened: null,
      enterBatch: true,
      frontier: readyPending.map(n => ({
        id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set,
      })),
      allDone: false,
    };
  }

  // Open the next ready node.
  const nextNode = nextAction.nextNode;
  if (!nextNode) {
    return { result: 'ok', closed: nodeId, opened: null, allDone: false };
  }

  let planForAdvance = readFile(planPath);
  const advanceSplice = spliceLedgerNode(planForAdvance, nextNode.id, 'in_progress', { allowFrom: ['pending'] });

  if (advanceSplice.changed) {
    planForAdvance = advanceSplice.content;
    writeFile(planPath, planForAdvance);
  }

  // Record baseline for the newly opened node.
  const baselineResult = shell(commitNodePath, [planPath, '--node-id', nextNode.id, '--start', '--json']);

  return {
    result: 'ok',
    closed: nodeId,
    opened: {
      id: nextNode.id,
      role: nextNode.role,
      model: nextNode.model,
      declared_write_set: nextNode.declared_write_set,
    },
    baselineRecorded: baselineResult.exitCode === 0,
    allDone: false,
  };
}

// ---------------------------------------------------------------------------
// runWriteHalt — MUTATES state + ledger.
// Writes escalated_to_full + consent_halt markers. Idempotent.
// ---------------------------------------------------------------------------
function runWriteHalt(opts) {
  const { planPath, statePath, nodeId, reason, readFile, writeFile } = opts;

  const validReasons = ['consent', 'security', 'test_thrash'];
  if (!validReasons.includes(reason)) {
    return { result: 'refuse', reason: 'invalid_reason', validReasons };
  }

  // Determine markers to write.
  const stateMarkers = [];  // { key, value } pairs for workflow-state.md
  const planMarkers  = [];  // lines for ## Node Ledger (in plan)

  if (reason === 'consent') {
    stateMarkers.push({ key: 'escalated_to_full', value: 'consent' });
    stateMarkers.push({ key: 'escalated_to_full', value: 'security' });
  } else {
    stateMarkers.push({ key: 'escalated_to_full', value: reason });
  }
  planMarkers.push('consent_halt: pending');

  // Write state markers — each marker may need a separate line.
  let stateContent = readFile(statePath);

  if (reason === 'consent') {
    // Both markers needed — use multi-line insertion.
    // Insert 'escalated_to_full: consent' and 'escalated_to_full: security'.
    // First check for existing markers.
    const hasConsent  = /^escalated_to_full:\s*consent\s*$/m.test(stateContent);
    const hasSecurity = /^escalated_to_full:\s*security\s*$/m.test(stateContent);

    if (!hasConsent || !hasSecurity) {
      // Remove any existing escalated_to_full lines first.
      stateContent = stateContent.replace(/^escalated_to_full:.*\n?/mg, '');
      // Insert both before ## Last Updated or at EOF.
      const luMarker = '\n## Last Updated';
      const luIdx = stateContent.indexOf(luMarker);
      const insertion = 'escalated_to_full: consent\nescalated_to_full: security\n';
      if (luIdx >= 0) {
        stateContent = stateContent.slice(0, luIdx) + '\n' + insertion + stateContent.slice(luIdx);
      } else {
        stateContent = stateContent.trimEnd() + '\n' + insertion;
      }
    }
  } else {
    stateContent = spliceStateMarker(stateContent, 'escalated_to_full', reason);
  }

  // Write consent_halt: pending into plan ## Node Ledger FIRST (durable marker).
  // This line is placed below the ledger header, not as a row — it's a freeform marker.
  let planContent = readFile(planPath);

  if (!planContent.includes('consent_halt: pending')) {
    const ledgerMarker = '\n## Node Ledger';
    const ledgerIdx = planContent.indexOf(ledgerMarker);
    if (ledgerIdx >= 0) {
      // Insert after the ## Node Ledger heading line.
      const afterHeading = planContent.indexOf('\n', ledgerIdx + 1);
      if (afterHeading >= 0) {
        planContent = planContent.slice(0, afterHeading + 1) + 'consent_halt: pending\n' + planContent.slice(afterHeading + 1);
      } else {
        planContent = planContent.trimEnd() + '\nconsent_halt: pending\n';
      }
    } else {
      planContent = planContent.trimEnd() + '\nconsent_halt: pending\n';
    }
    writeFile(planPath, planContent);
  }

  // Write state markers LAST (state file is regenerated from plan on crash recovery).
  writeFile(statePath, stateContent);

  // Build markers list for output.
  const markers = [];
  if (reason === 'consent') {
    markers.push('escalated_to_full:consent', 'escalated_to_full:security', 'consent_halt:pending');
  } else {
    markers.push('escalated_to_full:' + reason, 'consent_halt:pending');
  }

  return {
    result: 'ok',
    halt: 'written',
    markers,
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all process I/O lives here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-workflow-adaptive-node.js <subcommand> --project P --json [options]\n' +
      '  orient              --project P\n' +
      '  open-next           --project P [--node-id N]\n' +
      '  record-evidence     --project P --node-id N --stdin\n' +
      '  close-and-open-next --project P --node-id N\n' +
      '  write-halt          --project P --node-id N --reason consent|security|test_thrash\n'
    );
    return;
  }

  const subcommand  = args[0];
  const hasJson     = args.includes('--json');
  const projectIdx  = args.indexOf('--project');
  const nodeIdIdx   = args.indexOf('--node-id');
  const reasonIdx   = args.indexOf('--reason');
  const hasStdin    = args.includes('--stdin');

  if (!hasJson) {
    process.stdout.write('{"result":"refuse","errors":["--json is required"]}\n');
    process.exitCode = 1;
    return;
  }

  const hasProject = projectIdx >= 0 && projectIdx + 1 < args.length;
  if (!hasProject) {
    const out = { result: 'refuse', errors: ['--project is required'] };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

  const project  = args[projectIdx + 1];
  const nodeId   = nodeIdIdx >= 0 ? args[nodeIdIdx + 1] : null;
  const reason   = reasonIdx >= 0 ? args[reasonIdx + 1] : null;

  const repoRoot  = getRoot();
  const projectDir = path.join(repoRoot, 'kaola-workflow', project);
  const planPath  = path.join(projectDir, 'workflow-plan.md');
  const statePath = path.join(projectDir, 'workflow-state.md');
  const cacheDir  = path.join(projectDir, '.cache');

  const fs = require('fs');

  const shell    = (scriptPath, scriptArgs) => shellNode(scriptPath, scriptArgs);
  const readFile = (fpath) => fs.readFileSync(fpath, 'utf8');
  const writeFile = (fpath, content) => fs.writeFileSync(fpath, content, 'utf8');
  const cacheExists = (fpath) => fs.existsSync(fpath);

  let result;

  if (subcommand === 'orient') {
    result = runOrient({ planPath, statePath, project, shell, readFile, writeFile, cacheExists });
  } else if (subcommand === 'open-next') {
    result = runOpenNext({ planPath, statePath, project, nodeId, shell, readFile, writeFile });
  } else if (subcommand === 'record-evidence') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for record-evidence'] };
    } else if (!hasStdin) {
      result = { result: 'refuse', errors: ['--stdin required for record-evidence'] };
    } else {
      const stdinContent = fs.readFileSync(0, 'utf8');
      result = runRecordEvidence({
        planPath, statePath, project, nodeId, stdinContent,
        writeFile,
        mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
      });
    }
  } else if (subcommand === 'close-and-open-next') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for close-and-open-next'] };
    } else {
      result = runCloseAndOpenNext({ planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists });
    }
  } else if (subcommand === 'write-halt') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for write-halt'] };
    } else if (!reason) {
      result = { result: 'refuse', errors: ['--reason required for write-halt'] };
    } else {
      result = runWriteHalt({ planPath, statePath, project, nodeId, reason, readFile, writeFile });
    }
  } else {
    result = { result: 'refuse', errors: ['unknown subcommand: ' + subcommand] };
  }

  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.result === 'refuse') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  spliceLedgerNode,
  checkEvidenceShape,
  runOrient,
  runOpenNext,
  runRecordEvidence,
  runCloseAndOpenNext,
  runWriteHalt,
  shellNode,
};
