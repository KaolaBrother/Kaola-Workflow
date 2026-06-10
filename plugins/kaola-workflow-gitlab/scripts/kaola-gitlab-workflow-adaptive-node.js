#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitlab-workflow-adaptive-node.js (issue #272)
//
// Pure-composition aggregator: owns the per-node adaptive lifecycle for
// /kaola-workflow-plan-run. Shells the frozen-core scripts via child_process
// and never imports-and-mutates them.
//
// Subcommands (all require --project P and --json; exit≠0 on refuse):
//   orient         --project P                        (READ-ONLY)
//   mirror-project --project P                        (#335: main→worktree mirror; READ-ONLY on ledger/state)
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
const COMMIT_NODE  = 'kaola-gitlab-workflow-commit-node.js';
const NEXT_ACTION  = 'kaola-gitlab-workflow-next-action.js';
const VALIDATOR    = 'kaola-gitlab-workflow-plan-validator.js';
const TASK_MIRROR  = 'kaola-gitlab-workflow-task-mirror.js';

const commitNodePath = path.join(__dirname, COMMIT_NODE);
const nextActionPath = path.join(__dirname, NEXT_ACTION);
const validatorPath  = path.join(__dirname, VALIDATOR);
const taskMirrorPath = path.join(__dirname, TASK_MIRROR);

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
// getMainRoot — #335: resolve the MAIN checkout root even when cwd is a linked
// worktree. Mirrors claim.js getCoordRoot/mainRootFromCoord (local re-impl per
// repo convention — claim.js does not export them). When `root` IS the main
// checkout, git-common-dir resolves to <root>/.git and the basename strip
// returns `root` unchanged.
// ---------------------------------------------------------------------------
function getMainRoot(root) {
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const coord = path.resolve(root, raw);
    return path.basename(coord) === '.git' ? path.dirname(coord) : coord;
  } catch (_) { return root; }
}

// ---------------------------------------------------------------------------
// copyTree — #335: small recursive copy (readdirSync withFileTypes +
// copyFileSync, skipping symlinks). Same shape as claim.js exportWorktreeDiff;
// no fs.cpSync precedent in this repo. Parents of `dest` are created by the
// caller (mkdirSync). Best-effort on directory entries; throws on file copy
// errors so the caller's transaction fails closed.
// ---------------------------------------------------------------------------
function copyTree(src, dest, io) {
  io.mkdirSync(dest, { recursive: true });
  const entries = io.readdir(src);
  for (const e of entries) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isSymbolicLink && e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      copyTree(from, to, io);
    } else if (e.isFile()) {
      io.copyFile(from, to);
    }
  }
}

// ---------------------------------------------------------------------------
// validateProjectName — #318: the project arg becomes a path SEGMENT under
// kaola-workflow/<project>/. The reserved literal 'kaola-workflow' (or an
// empty / '.' / '..' / separator-bearing segment) collapses the canonical
// join into a nested kaola-workflow/kaola-workflow/.cache path, the exact
// drift observed in the issue #249 run. Reject the project SEGMENT — NOT a
// path substring: this repo's own toplevel is named kaola-workflow, so the
// legitimate container path .../kaola-workflow/kaola-workflow/issue-N already
// contains the substring and a substring check would false-positive on every
// legit run. Legit projects are issue-N, so the reserved-name rule is safe.
//
// @param {string} project  the --project value
// @returns {{ ok:boolean, reason?:string }}
// ---------------------------------------------------------------------------
function validateProjectName(project) {
  if (!project || project === '.' || project === '..'
      || /[\\/]/.test(project) || project === 'kaola-workflow') {
    return { ok: false, reason: 'invalid_project' };
  }
  return { ok: true };
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
// #317 — mutation-time task-mirror sync + machine-readable UI transitions.
//
// refreshTaskMirror: regenerate the durable workflow-tasks.json from the just-mutated
// ledger by SHELLING the task-mirror CLI (resolved via taskMirrorPath, edition-neutral).
// CRITICAL fail-OPEN contract (opposite of every other guard here): a mirror-refresh
// failure must NEVER roll back a correct ledger transition — it is recorded in the
// returned `taskMirror` field and the command still returns result:'ok'. Callers invoke
// it ONLY after the final stable plan write of a successful ledger mutation.
//
// buildTransition: a machine-readable UI transition the orchestrator applies to the live
// task list without inference. `status` is mapped via the task-mirror's mapLedgerStatus so
// the UI map single-sources from the durable mirror and cannot drift.
// ---------------------------------------------------------------------------
function refreshTaskMirror(project, shell) {
  if (!project) return { status: 'skipped' };
  const outPath = 'kaola-workflow/' + project + '/workflow-tasks.json';
  let res;
  try { res = shell(taskMirrorPath, ['--project', project, '--json']); }
  catch (_) { return { status: 'failed', path: outPath }; }
  return { status: (res && res.exitCode === 0) ? 'updated' : 'failed', path: outPath };
}

function buildTransition(id, ledgerStatus, reason, note) {
  // Fail-OPEN, matching refreshTaskMirror: this runs AFTER the ledger is already written, so it must
  // never throw. mapLedgerStatus is a total switch (cannot throw), but the require() could in a
  // broken/partial install — fall back to an inline equivalent map so a transition is still returned.
  let status;
  try {
    status = require(taskMirrorPath).mapLedgerStatus(ledgerStatus);
  } catch (_) {
    status = (ledgerStatus === 'complete' || ledgerStatus === 'n/a') ? 'completed'
      : (ledgerStatus === 'in_progress' ? 'in_progress' : 'pending');
  }
  const t = { id: id, status: status, ledger_status: ledgerStatus, reason: reason };
  if (note) t.note = note;
  return t;
}

// ---------------------------------------------------------------------------
// appendNodeTiming (#373 / D1) — best-effort wall-clock telemetry sidecar.
// Appends ONE JSON line per node lifecycle transition to
// kaola-workflow/{project}/.cache/node-timings.jsonl. Append-only; NEVER throws — a
// timings write failure must never refuse or alter a transition. .cache/ is already a
// barrier-exempt workflow band, so this adds no validator surface. The ledger/plan
// formats are deliberately unchanged (the ledger has multiple parser consumers).
// ---------------------------------------------------------------------------
function appendNodeTiming(planPath, node, event) {
  try {
    const fs = require('fs');
    const cacheDir = path.join(path.dirname(planPath), '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.appendFileSync(
      path.join(cacheDir, 'node-timings.jsonl'),
      JSON.stringify({ node: node, event: event, ts: new Date().toISOString() }) + '\n'
    );
  } catch (_) { /* best-effort: telemetry never blocks a lifecycle transition */ }
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
// readLedgerStatuses — read-only id→status map from ## Node Ledger.
// Same header-driven parsing as spliceLedgerNode; {} when no parseable ledger.
// ---------------------------------------------------------------------------
function readLedgerStatuses(content) {
  const out = {};
  const ledgerMarker = '\n## Node Ledger';
  const ledgerIdx = content.indexOf(ledgerMarker);
  if (ledgerIdx < 0) return out;
  const afterLedger = content.indexOf('\n## ', ledgerIdx + 1);
  const ledgerBlock = afterLedger >= 0 ? content.slice(ledgerIdx, afterLedger) : content.slice(ledgerIdx);
  const rows = ledgerBlock.split('\n').filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) return out;
  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const stIdx = header.indexOf('status');
  if (idIdx < 0 || stIdx < 0) return out;
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
    const rowId = cells[idIdx] || '';
    if (rowId && !/^[-\s]+$/.test(rowId)) out[rowId] = (cells[stIdx] || '').toLowerCase();
  }
  return out;
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
    const { parseNodes } = require('./kaola-gitlab-workflow-plan-validator');
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
// @returns {{ ok:boolean, kind?:'absent'|'shape', missingTokenClass?:string, reason?:string, expected?:string[] }}
//   #319: on failure, `kind` discriminates absent ('absent') vs malformed
//   ('shape') evidence; `missingTokenClass` names the failed class
//   ('non_tdd_reason' / 'change-type' / 'RED' / 'GREEN' / 'non-empty').
// ---------------------------------------------------------------------------
function checkEvidenceShape(role, nodeId, evidence) {
  const content = evidence || '';

  // #334: a non-delegable main-session gate can never self-skip ('n/a') and must record a
  // machine verdict (column-0, last-match-wins, lowercase — mirrors schema.parseNodeVerdict).
  // Placed BEFORE the universal n/a carve-out on purpose.
  if (role === 'main-session-gate') {
    if (!content.trim()) {
      return { ok: false, kind: 'absent', missingTokenClass: 'non-empty',
        reason: 'evidence missing for main-session-gate node ' + nodeId, expected: ['verdict: pass|fail'] };
    }
    const vm = content.match(/^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/gm);
    const last = vm ? vm[vm.length - 1].replace(/^verdict:[ \t]*/, '').trim().toLowerCase() : null;
    if (last !== 'pass' && last !== 'fail') {
      return { ok: false, kind: 'shape', missingTokenClass: 'verdict',
        reason: 'main-session-gate ' + nodeId + ' evidence missing column-0 verdict: pass|fail line (an n/a skip is refused for a non-delegable gate)',
        expected: ['verdict: pass|fail'] };
    }
    return { ok: true };
  }

  // 'n/a' skip is universal.
  if (content.trim().startsWith('n/a')) {
    return { ok: true };
  }

  if (role === 'tdd-guide') {
    if (!content) {
      return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: 'evidence missing for tdd-guide node ' + nodeId, expected: ['RED', 'GREEN'] };
    }
    const hasRed   = /\bRED\b/.test(content);
    const hasGreen = /\bGREEN\b/.test(content);
    if (!hasRed) {
      return { ok: false, kind: 'shape', missingTokenClass: 'RED', reason: 'tdd-guide ' + nodeId + ' evidence missing RED token', expected: ['RED', 'GREEN'] };
    }
    if (!hasGreen) {
      return { ok: false, kind: 'shape', missingTokenClass: 'GREEN', reason: 'tdd-guide ' + nodeId + ' evidence missing GREEN token', expected: ['RED', 'GREEN'] };
    }
    return { ok: true };
  }

  if (role === 'implementer') {
    if (!content) {
      return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: 'evidence missing for implementer node ' + nodeId, expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    const hasReason = /non_tdd_reason/.test(content);
    const hasChangeType = /regression-green|build-green|smoke-integration/.test(content);
    if (!hasReason) {
      return { ok: false, kind: 'shape', missingTokenClass: 'non_tdd_reason', reason: 'implementer ' + nodeId + ' evidence missing non_tdd_reason', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    if (!hasChangeType) {
      return { ok: false, kind: 'shape', missingTokenClass: 'change-type', reason: 'implementer ' + nodeId + ' evidence missing change-type token', expected: ['non_tdd_reason', 'regression-green|build-green|smoke-integration'] };
    }
    return { ok: true };
  }

  // Other roles: file present and non-empty.
  if (!content.trim()) {
    return { ok: false, kind: 'absent', missingTokenClass: 'non-empty', reason: role + ' ' + nodeId + ' evidence missing or empty', expected: ['non-empty evidence file'] };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// runOrient — READ-ONLY orient (no plan/ledger/state mutation; never calls writeFile).
//
// Shells VALIDATOR --resume-check + NEXT_ACTION; scans markers in state+plan.
// #282 (AC-2): also reconciles the durable task mirror (workflow-tasks.json) on every resume
// by SHELLING the task-mirror CLI — the write happens in that subprocess (a regenerable,
// ledger-derived projection), so orient's read-only-w.r.t.-workflow-state contract is preserved.
// ---------------------------------------------------------------------------
function runOrient(opts) {
  const { planPath, statePath, project, shell, readFile, cacheExists } = opts;

  // #335: fail-closed when the plan file itself is absent. Distinguish an
  // unmirrored worktree (the MAIN checkout has the frozen project folder) from a
  // truly unauthored plan. The probe is CLI-wired; an absent probe (unit tests /
  // legacy library callers) preserves the old tolerant behavior byte-for-byte.
  if (opts.planProbe && !opts.planProbe.planExists) {
    const unmirrored = opts.planProbe.isLinkedWorktree && opts.planProbe.mainPlanExists;
    return {
      result: 'refuse',
      reason: unmirrored ? 'plan_not_mirrored' : 'plan_missing',
      planPath,
      mainPlanPath: unmirrored ? opts.planProbe.mainPlanPath : null,
      repair: unmirrored
        ? 'run: node kaola-workflow-adaptive-node.js mirror-project --project '
          + project + ' --json (mirrors the frozen kaola-workflow/' + project
          + '/ from the main checkout into this worktree, plan_hash-verified), then re-run orient'
        : 'no workflow-plan.md for ' + project
          + ' — author + freeze it via /kaola-workflow-adapt ' + project,
    };
  }

  const resumeCheck = shell(validatorPath, [planPath, '--resume-check', '--json']);
  const nextAction  = shell(nextActionPath, [planPath, '--json']);

  // #282 (AC-2): rebuild/refresh the durable workflow-tasks.json from the current ledger on every
  // resume. Unconditional regenerate is both the rebuild-if-stale and the idempotent-refresh path
  // (the CLI re-derives from the ledger). Best-effort: a non-frozen plan / absent project degrades
  // silently (the CLI exits non-zero, the compact-resume hook tolerates an absent mirror).
  if (project) shell(taskMirrorPath, ['--project', project, '--json']);

  // Read state for escalated_to_full marker.
  let stateContent = '';
  try { stateContent = readFile(statePath); } catch (_) {}

  const escalatedMatch = stateContent.match(/^escalated_to_full:\s*(.+)$/m);
  const escalatedToFull = escalatedMatch ? escalatedMatch[1].trim() : null;

  // #328: read bundle identity fields from state (additive; null/[] when absent).
  const m1 = stateContent.match(/^issue_numbers:\s*(.+)$/m);
  const issueNumbers = m1 ? m1[1].trim().split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0) : [];
  const m2 = stateContent.match(/^bundle_id:\s*(.+)$/m);
  const bundleId = m2 ? m2[1].trim() : null;
  const m3 = stateContent.match(/^closure_policy:\s*(.+)$/m);
  const closurePolicy = m3 ? m3[1].trim() : null;
  const m4 = stateContent.match(/^issue_number:\s*(\d+)$/m);
  const primaryIssue = m4 ? parseInt(m4[1], 10) : null;

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

  // #305: a member-level `opening:true` marker is an interrupted ROLLING TOP-UP (the manifest
  // stays whole-batch state 'open' while the in-flight member was appended but its ledger row /
  // baseline did not finish flipping). It is RECONCILABLE — route it to `reconcile`, the SAME
  // verdict the parallel-batch crossCheckStatus gate gives. Check it BEFORE the AC#5 legality gate
  // so it is never mis-reported as orphan_multi_in_progress (before the flip) and never ACCEPTED as
  // a dispatchable valid batch (after the flip). Mirrors crossCheckStatus's member-opening branch.
  if (manifest && (manifest.members || []).some(m => m.opening)) {
    return {
      result: 'refuse',
      reason: 'batch_topup_incomplete',
      resumeCheck,
      nextAction,
      consentHalt,
      escalatedToFull,
      bundleId,
      issueNumbers,
      closurePolicy,
      primaryIssue,
      inProgressNode,
      cacheState: inProgressNode ? cacheState : null,
      inProgressNodes,
      manifest,
      batch: null,
      allDone: false,
    };
  }

  // Order-independent member-set equality between the manifest and the
  // in_progress rows.
  // R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
  // #305: also exclude `opening:true` members (mirrors crossCheckStatus); redundant after the
  // short-circuit above but keeps the two member-set computations structurally identical.
  const manifestMemberIds = manifest ? (manifest.members || []).filter(m => !m.sealed && !m.opening).map(m => m.id) : [];
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
      bundleId,
      issueNumbers,
      closurePolicy,
      primaryIssue,
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
  // #334: a main-session-gate is never an openable BATCH member (the main session cannot run
  // concurrently with itself) — compute enterBatch/frontier over the delegable subset only. A
  // [gate, x] frontier therefore drops to enterBatch=false (single-node path); [gate, x, y]
  // batches [x, y] and the gate opens serially via open-next. Zero regression when absent.
  const delegable = startReadyPending.filter(n => n.role !== 'main-session-gate');
  const enterBatch = !allDone && inProgressNodes.length === 0 && delegable.length >= 2;

  return {
    result: 'ok',
    resumeCheck,
    nextAction,
    consentHalt,
    escalatedToFull,
    bundleId,
    issueNumbers,
    closurePolicy,
    primaryIssue,
    inProgressNode,
    cacheState: inProgressNode ? cacheState : null,
    inProgressNodes,
    batch,
    allDone,
    enterBatch,
    frontier: enterBatch
      ? delegable.map(n => ({ id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set }))
      : [],
  };
}

// ---------------------------------------------------------------------------
// runMirrorProject — #335: ONE mechanical main→worktree project-folder mirror.
//
// A fresh adaptive worktree is provisioned at claim time (before any plan
// exists) and the planner authors + freezes the plan in the MAIN checkout, so
// the worktree never receives kaola-workflow/<project>/. This transaction
// transports it deterministically: copy → plan_hash re-verify → atomic rename
// promote. Read-only on the ledger and workflow-state.md; never touches a
// per-node baseline (it runs strictly before any node is opened).
//
// Idempotent + safe at every plan-run entry: a worktree copy that already has a
// workflow-plan.md is authoritative (#264 semantics) and is never overwritten.
//
// @param {object} opts
//   project   {string}   project name (e.g. 'issue-335')
//   mainRoot  {string}   the MAIN checkout root (resolved via getMainRoot)
//   shell     {function} (scriptPath, args[]) → {exitCode,...parsedJson}
//   io        {object}   { exists, readFile, copyTree, renameSync, rmSync, mkdirSync, readdir, copyFile }
// @returns {object} typed result (refuse exits ≠ 0 via the CLI epilogue)
// ---------------------------------------------------------------------------
function runMirrorProject(opts) {
  const { project, mainRoot, shell, io } = opts;

  // 1. Source = the frozen project folder in the MAIN checkout.
  const source = path.join(mainRoot, 'kaola-workflow', project);
  const stateMain = path.join(source, 'workflow-state.md');
  if (!io.exists(stateMain)) {
    return {
      result: 'refuse',
      reason: 'state_missing',
      repair: 'run claim/startup first — no workflow-state.md for ' + project + ' in the main checkout',
    };
  }

  // 2. Parse worktree_path from the main state (same regex the plan-run docs use).
  let stateContent = '';
  try { stateContent = io.readFile(stateMain); } catch (_) { stateContent = ''; }
  const m = stateContent.match(/^worktree_path:\s*(.+)$/m);
  const worktreePath = m ? m[1].trim() : '';
  if (!worktreePath) {
    // In-place run (KAOLA_WORKTREE_NATIVE=0), offline, bundle lane — all legal.
    return { result: 'ok', status: 'skipped', reason: 'no_worktree' };
  }
  if (!io.exists(worktreePath)) {
    // Recorded but pruned — matches the plan-run doc's $(pwd) fallback semantics.
    return { result: 'ok', status: 'skipped', reason: 'worktree_dir_missing', worktreePath };
  }

  // 3. Destination project folder in the worktree.
  const dest = path.join(worktreePath, 'kaola-workflow', project);
  const destPlan = path.join(dest, 'workflow-plan.md');
  if (io.exists(destPlan)) {
    // NEVER overwrite — on resume the worktree copy is authoritative (#264).
    return { result: 'ok', status: 'exists', dest };
  }

  // 4. Source plan must exist (the planner authored + froze it in main).
  const sourcePlan = path.join(source, 'workflow-plan.md');
  if (!io.exists(sourcePlan)) {
    return {
      result: 'refuse',
      reason: 'source_plan_missing',
      source,
      repair: 'author + freeze the plan via /kaola-workflow-adapt ' + project + ' first',
    };
  }

  // 5. Atomic copy → verify → rename promote.
  const tmp = path.join(worktreePath, 'kaola-workflow', '.mirror-tmp-' + project);
  // Clean any crash leftover before copying.
  try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  try { io.mkdirSync(path.dirname(tmp), { recursive: true }); } catch (_) {}

  try {
    io.copyTree(source, tmp);
  } catch (err) {
    try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return { result: 'refuse', reason: 'mirror_failed', detail: (err && err.message) || String(err) };
  }

  // AC4: plan_hash re-verification on the COPIED plan before the promote.
  const resumeCheck = shell(validatorPath, [path.join(tmp, 'workflow-plan.md'), '--resume-check', '--json']);
  if (!resumeCheck || !resumeCheck.ok) {
    try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return {
      result: 'refuse',
      reason: 'mirror_verify_failed',
      detail: (resumeCheck && resumeCheck.reason) || 'resume-check failed on the copied plan',
      source,
      dest,
    };
  }

  // Atomic same-filesystem promote.
  try {
    io.renameSync(tmp, dest);
  } catch (err) {
    if (err && (err.code === 'EEXIST' || err.code === 'ENOTEMPTY')) {
      // Race: a concurrent entry promoted the dest first — the existing copy wins.
      try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
      return { result: 'ok', status: 'exists', dest };
    }
    try { io.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return { result: 'refuse', reason: 'mirror_failed', detail: (err && err.message) || String(err) };
  }

  return {
    result: 'ok',
    status: 'mirrored',
    source,
    dest,
    planHash: resumeCheck.planHash,
    verified: true,
  };
}

// ---------------------------------------------------------------------------
// runOpenNext — MUTATES ledger + baseline.
// Opens the next ready node (or a specified --node-id) in the ledger and
// records its per-node baseline.
// ---------------------------------------------------------------------------
function runOpenNext(opts) {
  const { planPath, statePath, project, nodeId: requestedId, shell, readFile, writeFile } = opts;

  // Shell NEXT_ACTION.
  const nextAction = shell(nextActionPath, [planPath, '--json']);

  if (nextAction.exitCode !== 0 || nextAction.result !== 'ok') {
    return { result: 'refuse', reason: 'next_action_failed', nextAction };
  }

  if (nextAction.allDone) {
    return { result: 'ok', allDone: true, opened: null, taskTransitions: [] };
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

  // #373: best-effort telemetry — the node opened.
  appendNodeTiming(planPath, targetNode.id, 'opened');

  // #317: ledger row flipped pending → in_progress; refresh the durable mirror and
  // return the explicit UI transition for the orchestrator to apply.
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
    taskTransitions: [buildTransition(targetNode.id, 'in_progress', 'open-next')],
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runRecordEvidence — MUTATES .cache.
// Reads stdin content and writes verbatim to .cache/<nodeId>.md.
// ---------------------------------------------------------------------------
function runRecordEvidence(opts) {
  const { planPath, project, nodeId, stdinContent, writeFile, mkdirp } = opts;

  // #318: refuse a reserved/illegal project SEGMENT before any write so a
  // record-evidence call can never create a nested kaola-workflow/kaola-workflow
  // /.cache path. Fail-closed: return BEFORE mkdirp/writeFile so a refused call
  // is a pure no-op (zero mutation).
  const v = validateProjectName(project);
  if (!v.ok) {
    return {
      result: 'refuse',
      reason: 'nested_cache_path',
      project: project,
      detail: 'project segment ' + JSON.stringify(project) + ' is reserved/illegal — '
        + 'would create a nested kaola-workflow/kaola-workflow/.cache path',
      repair: 'Re-run record-evidence with --project <issue-N> (the active project '
        + 'folder), then remove any stray kaola-workflow/kaola-workflow/ directory left '
        + 'in the worktree.',
    };
  }

  const cacheDir = path.join(path.dirname(planPath), '.cache');
  const cachePath = path.join(cacheDir, nodeId + '.md');

  if (mkdirp) mkdirp(cacheDir);

  writeFile(cachePath, stdinContent);

  // #373: best-effort telemetry — evidence recorded for the node.
  appendNodeTiming(planPath, nodeId, 'evidence');

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
  const { planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists } = opts;
  // #317: accumulate the UI transitions as the ledger mutates so every ok exit returns
  // the exact set the orchestrator must apply. The closed node is added after its close
  // write; selector n/a arms and any newly-opened node are appended at their mutation points.
  const transitions = [];

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
    // #319: distinguish absent evidence from malformed (shape) evidence so the
    // refusal names the actual fault, and surface the missing token class so a
    // consumer (or the operator) knows exactly what to add — instead of the old
    // catch-all 'evidence_missing' that conflated absent and malformed.
    const absent = !evidencePresent || shapeCheck.kind === 'absent';
    return {
      result: 'refuse',
      reason: absent ? 'evidence_absent' : 'evidence_shape_failed',
      missingTokenClass: shapeCheck.missingTokenClass || null,
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

  const newStatus = 'complete';
  // #348: close ONLY an in_progress node. Dropping 'n/a' from allowFrom means a skipped
  // (n/a) node is never silently flipped to complete. The splice can be a NO-OP in two ways
  // and BOTH must refuse with zero mutation — no compliance row, no plan write — so we never
  // append a `Required Agent Compliance` row (or run the fused advance) over a node that was
  // not actually closed. The reachable trigger is a #305-class crash interleaving: open-batch
  // records a baseline BEFORE the ledger flip, so the barrier can pass while the row is still
  // pending. alreadyAtTarget (row already 'complete') still proceeds — idempotent resume.
  const closeResult = spliceLedgerNode(currentPlan, nodeId, newStatus, { allowFrom: ['in_progress'] });

  if (!closeResult.found) {
    return { result: 'refuse', reason: 'close_node_not_in_ledger', nodeId };
  }
  if (!closeResult.changed && !closeResult.alreadyAtTarget) {
    return { result: 'refuse', reason: 'close_transition_disallowed', nodeId };
  }
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

  // #338: role 'finalize' is the mandatory DAG sink — the plan-run contract says the MAIN
  // SESSION performs its bookkeeping directly (no Agent dispatch), so certifying it as
  // subagent-invoked would be false. Record the truthful execution mode instead. This row
  // is NOT part of the delegation vocabulary checked by repair-state (a 'finalize (id)'
  // requirement matches none of DELEGATION_CONTROLLED_REQUIREMENTS) and does not require
  // codex-preflight (no dispatch happens).
  const complianceStatus = role === 'finalize' ? 'main-session-direct' : 'subagent-invoked';
  const complianceRow = '| ' + requirementCell + ' | ' + complianceStatus + ' | ' + evidenceSummary + ' | |';
  currentPlan = spliceComplianceRow(currentPlan, complianceRow);

  // Write the plan now (ledger + compliance — all non-state writes).
  writeFile(planPath, currentPlan);

  // #373: best-effort telemetry — the node closed.
  appendNodeTiming(planPath, nodeId, 'closed');

  // #317: the closed node → completed (every ok exit carries this).
  transitions.push(buildTransition(nodeId, 'complete', 'close-and-open-next'));

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
      // #317: each armed-off select arm → n/a (UI maps n/a to completed).
      transitions.push(buildTransition(armId, 'n/a', 'selector-arm'));
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
      taskTransitions: transitions,
      taskMirror: refreshTaskMirror(project, shell),
    };
  }

  if (nextAction.allDone) {
    return { result: 'ok', closed: nodeId, opened: null, allDone: true, taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
  }

  // #303 (gap #2 / sub-gap C): SCHEDULER-AWARE fused advance. When closing this node
  // exposes a frontier of >= 2 own-pending ready siblings, that is a fan-out — do NOT
  // single-open one node (which would serialize an independent fan-out behind one member).
  // Signal enterBatch so the orchestrator routes to the bounded batch scheduler (open-batch
  // + rolling top-up). Linear chains (readyPending < 2) keep the serial single-open below.
  // #334: exclude a main-session-gate from the batch frontier (the main session cannot run
  // concurrently with itself) — the gate opens serially via the single-node path below. A
  // [gate, x] frontier therefore falls through to single-open; [gate, x, y] batches [x, y].
  const readyPending = (nextAction.readyPending || []).filter(n => n.role !== 'main-session-gate');
  if (readyPending.length >= 2) {
    // #317: enterBatch carries ONLY the closed-node (and any selector arms) transitions —
    // open-batch owns the member in_progress flips; do not invent them here.
    return {
      result: 'ok',
      closed: nodeId,
      opened: null,
      enterBatch: true,
      frontier: readyPending.map(n => ({
        id: n.id, role: n.role, model: n.model, declared_write_set: n.declared_write_set,
      })),
      allDone: false,
      taskTransitions: transitions,
      taskMirror: refreshTaskMirror(project, shell),
    };
  }

  // Open the next ready node.
  const nextNode = nextAction.nextNode;
  if (!nextNode) {
    return { result: 'ok', closed: nodeId, opened: null, allDone: false, taskTransitions: transitions, taskMirror: refreshTaskMirror(project, shell) };
  }

  let planForAdvance = readFile(planPath);
  const advanceSplice = spliceLedgerNode(planForAdvance, nextNode.id, 'in_progress', { allowFrom: ['pending'] });

  if (advanceSplice.changed) {
    planForAdvance = advanceSplice.content;
    writeFile(planPath, planForAdvance);
  }

  // #373: best-effort telemetry — the fused advance opened the next node.
  appendNodeTiming(planPath, nextNode.id, 'opened');

  // Record baseline for the newly opened node.
  const baselineResult = shell(commitNodePath, [planPath, '--node-id', nextNode.id, '--start', '--json']);

  // #317: fused advance opened the next node → in_progress (in addition to the closed node).
  transitions.push(buildTransition(nextNode.id, 'in_progress', 'close-and-open-next'));

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
    taskTransitions: transitions,
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runWriteHalt — MUTATES state + ledger.
// Writes escalated_to_full + consent_halt markers. Idempotent.
// ---------------------------------------------------------------------------
function runWriteHalt(opts) {
  const { planPath, statePath, project, nodeId, reason, shell, readFile, writeFile } = opts;

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

  // #373: best-effort telemetry — the node halted.
  appendNodeTiming(planPath, nodeId, 'halted');

  // Build markers list for output.
  const markers = [];
  if (reason === 'consent') {
    markers.push('escalated_to_full:consent', 'escalated_to_full:security', 'consent_halt:pending');
  } else {
    markers.push('escalated_to_full:' + reason, 'consent_halt:pending');
  }

  // #317: the halted node STAYS in_progress (write-halt adds a consent_halt marker, no ledger
  // flip); surface that with a halt note + refresh the mirror (AC4 lists write-halt).
  return {
    result: 'ok',
    halt: 'written',
    markers,
    taskTransitions: [buildTransition(nodeId, 'in_progress', 'write-halt', 'HALTED: ' + reason)],
    taskMirror: refreshTaskMirror(project, shell),
  };
}

// ---------------------------------------------------------------------------
// runReopenNode — MUTATES ledger + per-node baselines. #308 first-class plan-repair.
//
// Reopens an already-`complete` node N for an in-place repair (a review-finding fix or
// a finalize-surfaced scope fix) WITHOUT hand-editing workflow-plan.md. Steps:
//   (1) Refuse over a live parallel batch / interrupted top-up (member.opening:true) so
//       this never fights the #305 reconcile guards.
//   (2) Require N to be a `complete` ledger row (only a finished node is repairable).
//   (3) Reset N's POST-DOMINATING gate(s) — code-reviewer / security-reviewer /
//       adversarial-verifier nodes that every path from N to the unique sink passes
//       through — complete|in_progress → pending (#343 mid-gate repair: a gate that just
//       emitted a blocking finding owned by N folds back without an allDone detour), and
//       remove their stale .cache/barrier-base-<id> baselines, so they re-review after
//       the repair. Any OTHER in_progress row (a non-gate node mid-flight, or a gate that
//       does not post-dominate N) refuses typed `would_orphan_in_progress` BEFORE any
//       real side effect. Downstream NON-gate nodes (incl. the sink) are left as-is:
//       next-action's #308 transitive readiness withholds them while an upstream gate is
//       non-terminal (no broad cascade needed).
//   (4) Reopen N pending→in_progress, remove its stale baseline, persist the plan, then
//       re-record a FRESH baseline at the current merged state (commit-node --start) so
//       the next barrier attributes ONLY the repair.
// ---------------------------------------------------------------------------
function runReopenNode(opts) {
  const { planPath, project, nodeId, shell, readFile, writeFile, cacheExists, unlink, readdir } = opts;
  // #334: a downstream non-delegable main-session-gate is reset like the reviewer gates so a
  // plan-repair to implementation re-triggers the visual check (it post-dominates N and folds
  // complete|in_progress → pending; the orphan guard at (3b) tolerates it for the same reason).
  const GATE_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier', 'main-session-gate']);

  // (1) Refuse over a live batch / interrupted top-up — mirror the #305 guards.
  const manifestPath = path.join(path.dirname(planPath), '.cache', 'active-batch.json');
  const manifestPresent = cacheExists ? cacheExists(manifestPath) : false;
  if (manifestPresent) {
    let raw = null;
    try { raw = readFile(manifestPath); } catch (_) { raw = null; }
    const m = raw != null ? safeJsonParse(raw) : null;
    if (m && Array.isArray(m.members)) {
      const live = m.state && m.state !== 'joined' && m.state !== 'aborted';
      const opening = m.members.some(x => x.opening);
      if (live || opening) {
        return { result: 'refuse', reason: 'active_batch_exists', state: m.state || null, detail: 'reconcile/clear the active batch before a plan-repair reopen' };
      }
    }
  }

  let planContent = readFile(planPath);
  // (2-pre) #343: capture the PRE-mutation ledger statuses for the orphan guard below.
  const ledgerStatuses = readLedgerStatuses(planContent);
  const nodes = parseNodesFromContent(planContent);
  if (!nodes.length) return { result: 'refuse', reason: 'no_parseable_nodes' };
  if (!nodes.some(n => n.id === nodeId)) return { result: 'refuse', reason: 'node_not_found', nodeId };

  // (2) N must be a COMPLETE ledger row — reset complete→pending.
  const reset = spliceLedgerNode(planContent, nodeId, 'pending', { allowFrom: ['complete'] });
  if (!reset.found) return { result: 'refuse', reason: 'node_not_in_ledger', nodeId };
  if (!reset.changed) {
    return { result: 'refuse', reason: 'node_not_complete', nodeId, detail: 'only a complete node can be reopened for repair' };
  }
  planContent = reset.content;

  // (3) Post-dominating gate(s): gate-role descendants of N that every path N→sink crosses.
  const fwd = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) for (const d of n.dependsOn) if (fwd.has(d)) fwd.get(d).push(n.id);
  const descendantsOf = start => {
    const seen = new Set();
    const stack = (fwd.get(start) || []).slice();
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of (fwd.get(x) || [])) if (!seen.has(y)) stack.push(y);
    }
    return seen;
  };
  const ids = new Set(nodes.map(n => n.id));
  const hasOut = new Set();
  for (const n of nodes) for (const d of n.dependsOn) if (ids.has(d)) hasOut.add(d);
  const terminals = nodes.filter(n => !hasOut.has(n.id));
  const sink = terminals.length === 1 ? terminals[0].id : null;
  const postDominates = gid => {
    if (!sink) return true; // no unique sink → conservatively treat the gate as gating
    const seen = new Set([gid]); // gid removed from the graph
    const stack = [nodeId];
    while (stack.length) {
      const x = stack.pop();
      if (x === sink) return false; // reached the sink avoiding gid → gid does NOT post-dominate
      for (const y of (fwd.get(x) || [])) if (!seen.has(y)) { seen.add(y); stack.push(y); }
    }
    return true; // sink unreachable without gid → gid post-dominates N
  };
  const desc = descendantsOf(nodeId);
  const gatesReset = nodes
    .filter(n => desc.has(n.id) && GATE_ROLES.has(n.role) && postDominates(n.id))
    .map(n => n.id);

  // (3b) #343 fail-closed orphan guard: the ONLY in_progress rows tolerated at reopen time
  // are post-dominating gates of N (they fold to pending below). Any other in_progress
  // row would leave an orphan multi-in_progress ledger after the reopen — refuse BEFORE
  // any real side effect (unlink/writeFile/baseline) so a refused call is a pure no-op.
  // (id !== nodeId is defensive only — an in_progress N is already refused node_not_complete.)
  const gateSet = new Set(gatesReset);
  const orphans = Object.keys(ledgerStatuses)
    .filter(id => ledgerStatuses[id] === 'in_progress' && id !== nodeId && !gateSet.has(id));
  if (orphans.length) {
    return {
      result: 'refuse',
      reason: 'would_orphan_in_progress',
      nodeId,
      inProgress: orphans,
      detail: 'in_progress row(s) [' + orphans.join(', ') + '] are not post-dominating gates of '
        + nodeId + ' — reopening would leave an orphan multi-in_progress ledger',
      repair: 'close the listed node(s) via close-and-open-next (or reconcile/abort the batch) '
        + 'first, then re-run reopen-node',
    };
  }

  // (3c) Fold the post-dominating gates to pending. #343: an in_progress gate — the mid-gate
  // repair case (the gate just emitted a blocking finding owned by N) — folds back to
  // pending exactly like a complete one, so the repair does NOT have to advance the DAG
  // to allDone on a known-broken tree. gatesFolded = the rows actually flipped.
  const gatesFolded = [];
  for (const gid of gatesReset) {
    const s = spliceLedgerNode(planContent, gid, 'pending', { allowFrom: ['complete', 'in_progress'] });
    if (s.changed) { planContent = s.content; gatesFolded.push(gid); }
  }

  // (4) Remove stale per-node baselines for N + the reset gates.
  const cacheBaseFile = nid => path.join(path.dirname(planPath), '.cache', 'barrier-base-' + String(nid).replace(/[^A-Za-z0-9_-]/g, '_'));
  const baselinesRemoved = [];
  for (const id of [nodeId, ...gatesReset]) {
    const bf = cacheBaseFile(id);
    const present = cacheExists ? cacheExists(bf) : true;
    if (present && typeof unlink === 'function') {
      unlink(bf);
      baselinesRemoved.push('barrier-base-' + String(id).replace(/[^A-Za-z0-9_-]/g, '_'));
    }
    // #368: also drop the gc-anchored baseline REF (not just the .cache file). A dangling ref
    // would otherwise survive the reopen and, paired with a re-recorded file, could trip
    // --barrier-check's barrier_base_mismatch. --drop-base removes file+ref together and is
    // idempotent (a missing file/ref is a clean no-op).
    shell(validatorPath, [planPath, '--drop-base', '--node-id', id, '--json']);
  }

  // (4b) #349: remove stale gate VERDICT evidence for the reset gates. A gate is folded back to
  // pending precisely because its prior verdict no longer applies to the changed tree; leaving
  // its `.cache/<gate-id>.md` in place lets a later close-without-fresh-dispatch (orchestrator
  // error, resume confusion, or the no-op-close path) pass Finalization's blocking --verdict-check
  // on a STALE `verdict: pass` / `findings_blocking: 0` — shipping repaired code unreviewed.
  // record-evidence writes the file verbatim as `<nodeId>.md` (NOT sanitized like the baseline).
  // For a fanout adversarial-verifier gate, the verdict-check globs `.cache/adversarial-verifier-*.md`
  // per-instance siblings — purge those too (once).
  const cacheDir = path.dirname(cacheBaseFile(nodeId));
  const gateById = new Map(nodes.map(n => [n.id, n]));
  const evidenceRemoved = [];
  let fanoutSiblingsPurged = false;
  for (const gid of gatesReset) {
    const ev = path.join(cacheDir, gid + '.md');
    if ((cacheExists ? cacheExists(ev) : false) && typeof unlink === 'function') {
      unlink(ev);
      evidenceRemoved.push(gid + '.md');
    }
    const g = gateById.get(gid);
    if (g && g.role === 'adversarial-verifier' && g.shape && g.shape.kind === 'fanout'
        && !fanoutSiblingsPurged && typeof readdir === 'function') {
      for (const name of readdir(cacheDir)) {
        if (typeof name === 'string' && /^adversarial-verifier-.*\.md$/.test(name) && typeof unlink === 'function') {
          unlink(path.join(cacheDir, name));
          evidenceRemoved.push(name);
        }
      }
      fanoutSiblingsPurged = true;
    }
  }

  // Reopen N pending→in_progress, persist the plan (so commit-node --start sees the row),
  // then re-record the fresh baseline at the current merged state.
  const reopen = spliceLedgerNode(planContent, nodeId, 'in_progress', { allowFrom: ['pending'] });
  if (reopen.changed) planContent = reopen.content;
  writeFile(planPath, planContent);

  const baseline = shell(commitNodePath, [planPath, '--node-id', nodeId, '--start', '--json']);
  if (!(baseline.exitCode === 0 && baseline.result === 'ok')) {
    return { result: 'refuse', reason: 'baseline_failed', nodeId, baselineResult: baseline, reopened: nodeId, gatesReset };
  }

  // #317: post-dominating gates were folded → pending; the reopened node → in_progress.
  // #343: transitions are built from gatesFolded (rows actually flipped), never the
  // structural gatesReset — an already-pending downstream gate gets NO fabricated entry.
  const reopenTransitions = gatesFolded.map(g => buildTransition(g, 'pending', 'reopen-node'));
  reopenTransitions.push(buildTransition(nodeId, 'in_progress', 'reopen-node'));

  return {
    result: 'ok', reopened: nodeId, gatesReset, gatesFolded, baselinesRemoved, evidenceRemoved, baselineRecorded: true,
    taskTransitions: reopenTransitions,
    taskMirror: refreshTaskMirror(project, shell),
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
      '  mirror-project      --project P\n' +
      '  open-next           --project P [--node-id N]\n' +
      '  record-evidence     --project P --node-id N --stdin\n' +
      '  close-and-open-next --project P --node-id N\n' +
      '  write-halt          --project P --node-id N --reason consent|security|test_thrash\n' +
      '  reopen-node         --project P --node-id N\n'
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

  // #318: fail-closed for every subcommand on a reserved/illegal project segment
  // so no path (plan/state/cache/manifest) is ever built under a nested
  // kaola-workflow/kaola-workflow/ directory.
  const projectValid = validateProjectName(project);
  if (!projectValid.ok) {
    const out = {
      result: 'refuse',
      reason: 'invalid_project',
      errors: ['project segment is reserved/illegal: ' + JSON.stringify(project)],
    };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

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

  // #335: resolve the MAIN checkout root even when cwd is a linked worktree.
  // realpath both sides so a macOS /var vs /private/var divergence under
  // os.tmpdir() never false-positives the linked-worktree comparison.
  let realRepoRoot = repoRoot;
  try { realRepoRoot = fs.realpathSync(repoRoot); } catch (_) {}
  let mainRoot = getMainRoot(repoRoot);
  try { mainRoot = fs.realpathSync(mainRoot); } catch (_) {}

  let result;

  if (subcommand === 'orient') {
    const mainPlanPath = path.join(mainRoot, 'kaola-workflow', project, 'workflow-plan.md');
    const planProbe = {
      planExists: fs.existsSync(planPath),
      isLinkedWorktree: mainRoot !== realRepoRoot,
      mainPlanExists: fs.existsSync(mainPlanPath),
      mainPlanPath,
    };
    result = runOrient({ planPath, statePath, project, shell, readFile, writeFile, cacheExists, planProbe });
  } else if (subcommand === 'mirror-project') {
    result = runMirrorProject({
      project,
      mainRoot,
      shell,
      io: {
        exists: (p) => fs.existsSync(p),
        readFile,
        copyTree: (src, dst) => copyTree(src, dst, {
          mkdirSync: (d, o) => fs.mkdirSync(d, o),
          readdir: (d) => fs.readdirSync(d, { withFileTypes: true }),
          copyFile: (a, b) => fs.copyFileSync(a, b),
        }),
        renameSync: (a, b) => fs.renameSync(a, b),
        rmSync: (p, o) => fs.rmSync(p, o),
        mkdirSync: (d, o) => fs.mkdirSync(d, o),
      },
    });
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
      result = runWriteHalt({ planPath, statePath, project, nodeId, reason, shell, readFile, writeFile });
    }
  } else if (subcommand === 'reopen-node') {
    if (!nodeId) {
      result = { result: 'refuse', errors: ['--node-id required for reopen-node'] };
    } else {
      result = runReopenNode({
        planPath, statePath, project, nodeId, shell, readFile, writeFile, cacheExists,
        unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} },
        readdir: (d) => { try { return fs.readdirSync(d); } catch (_) { return []; } },
      });
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
  validateProjectName,
  runOrient,
  runMirrorProject,
  runOpenNext,
  runRecordEvidence,
  runCloseAndOpenNext,
  runWriteHalt,
  runReopenNode,
  shellNode,
};
