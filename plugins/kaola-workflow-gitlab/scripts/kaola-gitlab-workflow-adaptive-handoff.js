#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitlab-workflow-adaptive-handoff.js (issue #255)
//
// Aggregator: collapses the contractor classify/freeze/orient/advance steps into
// ONE mechanical transition. The workflow-planner RUNS this (never judges);
// the orchestrator drives the bounded repair loop on plan_invalid.
//
// CLI: node kaola-gitlab-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json [--state-mtime ISO]
//
// JSON output schema:
//   ready:   { handoff_status:'ready_to_dispatch_first_node',
//               checklist:{ claim_acquired, plan_in_grammar, plan_frozen, resume_check_ok,
//                           first_node_opened, baseline_recorded, roadmap_staged },
//               first_node:{ id, role, model, declared_write_set }, decision, risk }
//   invalid: { handoff_status:'plan_invalid', result:'refuse', errors, validator_verdict }
//
// 2-state only: branch on validator --json `result` ('in-grammar'|'refuse'), NEVER on `decision`.
// decision:ask is audit METADATA that freezes-and-proceeds — NO needs_user_approval, NO --authorized.
//
// Crash-safe write order (binding):
//   1. validator --json  → branch on result. refuse → plan_invalid exit≠0, NO mutation; stop.
//   2. --freeze          → FIRST mutation.
//   3. --resume-check    → integrity gate.
//   4. next-action PURE  → first ready node + model.
//   5. commit-node --node-id <id> --start  → baseline (idempotent reuse).
//   6. Ledger splice: node1 pending→in_progress in workflow-plan.md.
//      NOTE: ## Node Ledger is OUTSIDE plan_hash (validator lines 146-148);
//            post-freeze ledger write is hash-safe.
//   7. roadmap init-issue + git add (EEXIST-skips).
//   8. workflow-state.md ## Planning Evidence insert — LAST (state pointer after all mutations).
// ---------------------------------------------------------------------------

const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// getRoot — resolve the USER-REPO root via git rev-parse --show-toplevel
// (process.cwd() fallback). Used ONLY for --project plan/state derivation.
// Mirrors the exact convention in kaola-workflow-active-folders.js and
// kaola-gitlab-workflow-roadmap.js so the user-repo root resolves correctly even
// when this script is installed under $HOME/.claude/kaola-workflow/scripts/.
// ---------------------------------------------------------------------------
function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// Sibling path constants — mirror commit-node pattern (resolve via __dirname).
// Keep each constant on its own clearly-named line so forge ports are one-line edits.
// ---------------------------------------------------------------------------
const VALIDATOR    = 'kaola-gitlab-workflow-plan-validator.js';
const COMMIT_NODE  = 'kaola-gitlab-workflow-commit-node.js';
const ROADMAP      = 'kaola-gitlab-workflow-roadmap.js';

const validatorPath  = path.join(__dirname, VALIDATOR);
const commitNodePath = path.join(__dirname, COMMIT_NODE);
const roadmapPath    = path.join(__dirname, ROADMAP);

// ---------------------------------------------------------------------------
// safeJsonParse — returns {} on any parse failure (fail-closed).
// ---------------------------------------------------------------------------
function safeJsonParse(str) {
  try { return JSON.parse(str || ''); } catch (_) { return {}; }
}

// ---------------------------------------------------------------------------
// shellHandoff — thin seam: execute a script (node <scriptPath> [...args]) and
// return { exitCode, ...parsedJson }. Exported for T8 seam test.
//
// For git commands (scriptPath ends with /git), shells git directly without 'node'.
// Default `shell` in runHandoff is a closure wrapping shellHandoff with specific script paths.
//
// @param {string} scriptPath  absolute path to the script to execute
// @param {string[]} args      CLI args (no plan path — caller includes plan path in args if needed)
// @returns {{ exitCode:number, [key:string]: any }}
// ---------------------------------------------------------------------------
function shellHandoff(scriptPath, args) {
  const isGit = path.basename(scriptPath) === 'git';
  let stdout;
  try {
    if (isGit) {
      stdout = execFileSync('git', args || [], { encoding: 'utf8' });
    } else {
      stdout = execFileSync('node', [scriptPath, ...(args || [])], { encoding: 'utf8' });
    }
    return { exitCode: 0, ...safeJsonParse(stdout) };
  } catch (err) {
    const status = (err.status == null) ? 1 : err.status; // fail-closed on signal kill
    return { exitCode: status, ...safeJsonParse(err.stdout) };
  }
}

// ---------------------------------------------------------------------------
// parseIssueNumber — extract issue_number from ## Sink section of workflow-state content.
// Returns number or null.
// ---------------------------------------------------------------------------
function parseIssueNumber(stateContent) {
  const sinkIdx = stateContent.indexOf('\n## Sink');
  if (sinkIdx < 0) return null;
  const sinkBlock = stateContent.slice(sinkIdx);
  const m = sinkBlock.match(/\nissue_number:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// parseProjectTitle — extract project name from ## Project section.
// Returns string or fallback.
// ---------------------------------------------------------------------------
function parseProjectName(stateContent, fallback) {
  const m = stateContent.match(/## Project[\s\S]*?\nname:\s*(.+)/);
  return m ? m[1].trim() : (fallback || 'unknown');
}

// ---------------------------------------------------------------------------
// splicePlanningEvidence — insert/replace ## Planning Evidence in state content.
//
// Anchor: insert immediately BEFORE ## Last Updated (fallback: before ## Sink;
// final fallback: append EOF). This preserves ## Sink + trailing optional fields
// byte-for-byte by construction.
//
// Idempotent: replace existing section (not append).
// ---------------------------------------------------------------------------
function splicePlanningEvidence(content, fields, stateMtime) {
  const SECTION = '## Planning Evidence';

  // Build the new block
  const fieldLines = fields.map(f => f.line);
  if (stateMtime) fieldLines.push('recorded_at: ' + stateMtime);
  const newBlock = SECTION + '\n' + fieldLines.join('\n') + '\n';

  // Regex to match an existing ## Planning Evidence section
  // (from the heading through the next ## heading or end-of-string)
  const existing = /## Planning Evidence\s*\n[\s\S]*?(?=\n## |\s*$)/;

  if (existing.test(content)) {
    // Replace-in-place (idempotent, not append).
    // Do NOT trimEnd() the block — keep the trailing '\n' so a re-run does
    // not eat the blank line before the next section (byte-idempotent).
    //
    // The '\s*$' lookahead in `existing` is zero-width: when PE is at EOF it
    // leaves a trailing '\n' in the content AFTER the match, and newBlock adds
    // its own trailing '\n', yielding a double '\n'. Normalize to exactly one
    // trailing '\n' so the EOF-append path is also byte-idempotent.
    return content.replace(existing, newBlock).replace(/\n+$/, '\n');
  }

  // No existing section — insert before ## Last Updated if present
  const luMarker = '\n## Last Updated';
  const luIdx = content.indexOf(luMarker);
  if (luIdx >= 0) {
    return content.slice(0, luIdx) + '\n' + newBlock + content.slice(luIdx);
  }

  // Fallback: insert before ## Sink
  const sinkMarker = '\n## Sink';
  const sinkIdx = content.indexOf(sinkMarker);
  if (sinkIdx >= 0) {
    return content.slice(0, sinkIdx) + '\n' + newBlock + content.slice(sinkIdx);
  }

  // Final fallback: append
  return content.trimEnd() + '\n\n' + newBlock;
}

// ---------------------------------------------------------------------------
// spliceLedgerNode — update a single node row's status cell in ## Node Ledger.
//
// GUARD: only write if current status === 'pending'.
// If already in_progress → leave (returns original content; first_node_opened:true).
// Does NOT regenerate the whole ledger — only replaces the status cell in the matching row.
//
// Returns { content: string, alreadyInProgress: boolean, found: boolean }
// ---------------------------------------------------------------------------
function spliceLedgerNode(content, nodeId, newStatus) {
  const ledgerMarker = '\n## Node Ledger';
  const ledgerIdx = content.indexOf(ledgerMarker);
  if (ledgerIdx < 0) return { content, alreadyInProgress: false, found: false };

  // Find the next ## heading after the ledger section (or end of file)
  const afterLedger = content.indexOf('\n## ', ledgerIdx + 1);
  const ledgerBlock = afterLedger >= 0
    ? content.slice(ledgerIdx, afterLedger)
    : content.slice(ledgerIdx);

  const rows = ledgerBlock.split('\n').filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) return { content, alreadyInProgress: false, found: false };

  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idIdx   = header.indexOf('id');
  const stIdx   = header.indexOf('status');
  if (idIdx < 0 || stIdx < 0) return { content, alreadyInProgress: false, found: false };

  let found = false;
  let alreadyInProgress = false;

  const newLedgerBlock = ledgerBlock.replace(/\n(\|[^\n]+)/g, (match, row) => {
    const cells = row.split('|').slice(1, -1);
    const rowId = (cells[idIdx] || '').trim();
    if (rowId !== nodeId) return match;

    found = true;
    const currentStatus = (cells[stIdx] || '').trim().toLowerCase();
    if (currentStatus === 'in_progress') {
      alreadyInProgress = true;
      return match; // leave unchanged
    }
    if (currentStatus !== 'pending') {
      // complete/n-a: contract boundary — don't touch
      return match;
    }

    // Replace ONLY the status cell (preserve all other columns + formatting)
    // Mirror the original cell spacing
    const origCell = cells[stIdx];
    const leadingSpace = origCell.match(/^(\s*)/)[1];
    const trailingSpace = origCell.match(/(\s*)$/)[1];
    const newCell = leadingSpace + newStatus + trailingSpace;
    cells[stIdx] = newCell;
    return '\n|' + cells.join('|') + '|';
  });

  if (!found) return { content, alreadyInProgress: false, found: false };

  const newContent = afterLedger >= 0
    ? content.slice(0, ledgerIdx) + newLedgerBlock + content.slice(afterLedger)
    : content.slice(0, ledgerIdx) + newLedgerBlock;

  return { content: newContent, alreadyInProgress, found };
}

// ---------------------------------------------------------------------------
// runHandoff — pure core with injected seams (no direct fs/process I/O).
//
// @param {object} opts
//   planPath        {string}   absolute path to workflow-plan.md
//   statePath       {string}   absolute path to workflow-state.md
//   project         {string}   project name (e.g. 'issue-255')
//   json            {boolean}  must be true (CLI requirement)
//   shell           {function} (scriptPath, args[]) → {exitCode,...parsedJson}
//   computeNextAction {function} (content, {resolveModel}) → nextAction result
//   resolveModel    {function} (role) → string model alias
//   readFile        {function} (path) → string (throws on missing)
//   writeFile       {function} (path, content) → void
//   stateMtime      {string|undefined} ISO timestamp → recorded_at field; omit when undefined
//
// @returns {object} handoff result (2-state)
// ---------------------------------------------------------------------------
function runHandoff(opts) {
  const {
    planPath,
    statePath,
    project,
    shell,
    computeNextAction,
    resolveModel,
    readFile,
    writeFile,
    stateMtime,
  } = opts;

  // -------------------------------------------------------------------------
  // Precondition: state file must exist and be parseable (claim_acquired check).
  // Missing/empty/unreadable → plan_invalid, NO mutation (step 0, before step 1).
  // -------------------------------------------------------------------------
  let stateContent;
  try {
    stateContent = readFile(statePath);
    if (!stateContent || !stateContent.trim()) {
      throw new Error('empty');
    }
  } catch (_) {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: ['workflow-state.md missing — planner did not claim'],
      validator_verdict: null,
    };
  }

  // -------------------------------------------------------------------------
  // Step 1: validator --json → branch on result.
  // refuse → return plan_invalid, exit≠0, NO mutation; stop.
  // All shelled scripts take planPath as args[0] (mirror commit-node/next-action convention).
  // -------------------------------------------------------------------------
  const validateResult = shell(validatorPath, [planPath, '--json']);
  if (validateResult.result !== 'in-grammar') {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: validateResult.errors || ['validator refused'],
      validator_verdict: validateResult,
    };
  }

  const decision = validateResult.decision || 'auto-run';
  const risk     = validateResult.risk     || {};

  // -------------------------------------------------------------------------
  // Step 2: --freeze (FIRST mutation). Writes plan_hash into the plan file.
  // Idempotent: re-freeze returns same hash + frozen:true.
  // -------------------------------------------------------------------------
  const freezeResult = shell(validatorPath, [planPath, '--freeze', '--json']);
  if (!freezeResult.frozen) {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: ['freeze failed (infra): frozen===false'],
      validator_verdict: freezeResult,
    };
  }
  const planHash = freezeResult.planHash;

  // -------------------------------------------------------------------------
  // Step 3: --resume-check (integrity gate on just-frozen plan).
  // -------------------------------------------------------------------------
  const resumeResult = shell(validatorPath, [planPath, '--resume-check', '--json']);
  if (!resumeResult.ok) {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: ['resume-check failed (infra): ok===false — ' + (resumeResult.reason || '')],
      validator_verdict: resumeResult,
    };
  }

  // -------------------------------------------------------------------------
  // Step 4: next-action PURE — read the (now frozen) plan content fresh to
  // avoid clobbering the plan_hash just stamped by --freeze.
  // -------------------------------------------------------------------------
  let frozenPlanContent;
  try {
    frozenPlanContent = readFile(planPath);
  } catch (_) {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: ['cannot re-read plan after freeze'],
      validator_verdict: null,
    };
  }

  const nextAction = computeNextAction(frozenPlanContent, { resolveModel });
  if (nextAction.result !== 'ok') {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: nextAction.errors || ['next-action returned refuse'],
      validator_verdict: null,
    };
  }

  const firstNode = nextAction.nextNode;
  if (!firstNode) {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: ['next-action returned no first node (plan may be complete already)'],
      validator_verdict: null,
    };
  }

  // -------------------------------------------------------------------------
  // Step 5: commit-node --node-id <id> --start --json (baseline; idempotent reuse).
  // -------------------------------------------------------------------------
  const baselineResult = shell(commitNodePath, [
    planPath, '--node-id', firstNode.id, '--start', '--json'
  ]);
  const baselineOk = baselineResult.exitCode === 0 && baselineResult.result === 'ok';
  if (!baselineOk) {
    return {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: ['baseline record failed (infra): result !== ok — ' + JSON.stringify(baselineResult)],
      validator_verdict: null,
    };
  }

  // -------------------------------------------------------------------------
  // Step 6: Ledger splice — node1 pending→in_progress in workflow-plan.md.
  // NOTE: ## Node Ledger is OUTSIDE plan_hash (validator lines 146-148);
  //       post-freeze ledger write is hash-safe.
  // GUARD: write iff status==='pending'. If already in_progress → leave (first_node_opened:true).
  // Read-modify-write (does NOT use the stale frozenPlanContent; re-reads via readFile).
  // -------------------------------------------------------------------------
  let currentPlanContent;
  try {
    currentPlanContent = readFile(planPath);
  } catch (_) {
    currentPlanContent = frozenPlanContent; // fallback (should not happen)
  }

  const spliceResult = spliceLedgerNode(currentPlanContent, firstNode.id, 'in_progress');
  let firstNodeOpened = false;
  if (spliceResult.alreadyInProgress) {
    firstNodeOpened = true; // already in_progress → idempotent
  } else if (spliceResult.found) {
    writeFile(planPath, spliceResult.content);
    firstNodeOpened = true;
  }

  // -------------------------------------------------------------------------
  // Step 7: roadmap init-issue + git add (EEXIST-skips when no issue_number).
  // roadmap_staged is vacuously true when no issue_number in state.
  // roadmap_staged is ADVISORY/best-effort: a non-EEXIST init-issue failure does
  // NOT block ready_to_dispatch_first_node; the finalize sink regenerates the roadmap.
  // -------------------------------------------------------------------------
  const issueNumber = parseIssueNumber(stateContent);
  let roadmapStaged = true;
  if (issueNumber != null) {
    const projectTitle = parseProjectName(stateContent, project);
    const initResult = shell(roadmapPath, [
      'init-issue',
      '--issue', String(issueNumber),
      '--title', projectTitle,
      '--status', 'open',
      '--workflow-project', project,
      '--next-step', 'adaptive',
    ]);
    // EEXIST-skip is a valid success (skip: true); created: true is also success
    roadmapStaged = initResult.exitCode === 0;

    if (roadmapStaged) {
      // git add the generated roadmap file
      const roadmapFile = path.join(
        path.dirname(path.dirname(planPath)), // kaola-workflow/<project> → kaola-workflow
        '.roadmap',
        'issue-' + issueNumber + '.md'
      );
      shell(path.join(path.dirname(validatorPath), 'git'), ['add', roadmapFile]);
    }
  }

  // -------------------------------------------------------------------------
  // Step 8: workflow-state.md ## Planning Evidence insert — LAST.
  // State pointer (## Current Position) NOT flipped (startup already set it).
  // -------------------------------------------------------------------------
  const peFields = [
    { line: 'plan_hash: ' + planHash },
    { line: 'decision: ' + decision },
    { line: 'risk: sensitivity=' + !!risk.sensitivity +
             ' blast_radius=' + !!risk.blastRadius +
             ' uncertain=' + !!risk.uncertain +
             ' reasons=' + (Array.isArray(risk.reasons) && risk.reasons.length > 0
               ? risk.reasons.join(';') : '—') },
    { line: 'first_node_id: ' + firstNode.id },
    { line: 'first_node_role: ' + firstNode.role },
  ];

  let currentState = readFile(statePath);
  const updatedState = splicePlanningEvidence(currentState, peFields, stateMtime);
  writeFile(statePath, updatedState);

  // -------------------------------------------------------------------------
  // Return — ready_to_dispatch_first_node
  // -------------------------------------------------------------------------
  return {
    handoff_status: 'ready_to_dispatch_first_node',
    checklist: {
      claim_acquired:    true,
      plan_in_grammar:   true,
      plan_frozen:       true,
      resume_check_ok:   true,
      first_node_opened: firstNodeOpened,
      baseline_recorded: baselineOk,
      roadmap_staged:    roadmapStaged,
    },
    first_node: {
      id:                   firstNode.id,
      role:                 firstNode.role,
      model:                firstNode.model,
      declared_write_set:   firstNode.declared_write_set,
    },
    decision,
    risk,
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all process I/O and FS live here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-gitlab-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json [--state-mtime ISO]\n' +
      '  --project NAME  derive plan from kaola-workflow/<NAME>/workflow-plan.md\n' +
      '  --plan PATH     explicit plan path; state is the sibling workflow-state.md\n' +
      '  --json          required; emit JSON output\n' +
      '  --state-mtime   optional injectable clock → recorded_at in Planning Evidence\n'
    );
    return;
  }

  const hasJson    = args.includes('--json');
  const projectIdx = args.indexOf('--project');
  const planIdx    = args.indexOf('--plan');
  const mtimeIdx   = args.indexOf('--state-mtime');

  const hasProject = projectIdx >= 0 && projectIdx + 1 < args.length;
  const hasPlan    = planIdx    >= 0 && planIdx    + 1 < args.length;
  const stateMtime = mtimeIdx   >= 0 ? args[mtimeIdx + 1] : undefined;

  if (!hasJson) {
    process.stdout.write('usage: kaola-gitlab-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json\n');
    return;
  }

  if ((hasProject ? 1 : 0) + (hasPlan ? 1 : 0) !== 1) {
    const out = {
      handoff_status: 'plan_invalid',
      result: 'refuse',
      errors: ['exactly one of --project or --plan required'],
    };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exitCode = 1;
    return;
  }

  const fs   = require('fs');
  // Use git rev-parse --show-toplevel (cwd fallback) for the --project branch so
  // the script resolves the USER-REPO root even when installed under
  // $HOME/.claude/kaola-workflow/scripts/ (where __dirname/.. would be the install dir).
  const repoRoot = getRoot();

  let planPath, statePath, project;

  if (hasProject) {
    project   = args[projectIdx + 1];
    planPath  = path.join(repoRoot, 'kaola-workflow', project, 'workflow-plan.md');
    statePath = path.join(repoRoot, 'kaola-workflow', project, 'workflow-state.md');
  } else {
    planPath  = path.resolve(args[planIdx + 1]);
    project   = path.basename(path.dirname(planPath));
    statePath = path.join(path.dirname(planPath), 'workflow-state.md');
  }

  const resolveModel = role =>
    require('./kaola-workflow-resolve-agent-model').resolveAgentModel(role);

  const shell = (scriptPath, scriptArgs) => shellHandoff(scriptPath, scriptArgs);

  const result = runHandoff({
    planPath,
    statePath,
    project,
    json: true,
    shell,
    computeNextAction: require('./kaola-gitlab-workflow-next-action').computeNextAction,
    resolveModel,
    readFile:  fpath => fs.readFileSync(fpath, 'utf8'),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content, 'utf8'),
    stateMtime,
  });

  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.handoff_status !== 'ready_to_dispatch_first_node') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { runHandoff, shellHandoff };
