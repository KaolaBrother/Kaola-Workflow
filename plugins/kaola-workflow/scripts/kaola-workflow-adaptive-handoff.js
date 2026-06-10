#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-adaptive-handoff.js (issue #255, updated #272)
//
// Aggregator: collapses the contractor classify/freeze/orient steps into
// ONE mechanical transition. The workflow-planner RUNS this (never judges);
// the orchestrator drives the bounded repair loop on plan_invalid.
// After #272, /kaola-workflow-plan-run owns the entire node lifecycle (incl. the
// FIRST node) via kaola-workflow-adaptive-node.js. This handoff no longer opens
// node1 or records its baseline — it returns ready_to_run and routes to plan-run.
//
// CLI: node kaola-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json [--state-mtime ISO]
//
// JSON output schema:
//   ready:   { handoff_status:'ready_to_run',
//               checklist:{ claim_acquired, plan_in_grammar, plan_frozen, resume_check_ok,
//                           roadmap_staged },
//               first_node:{ id, role, model, declared_write_set }  (ADVISORY — not yet opened),
//               decision, risk,
//               worktree_mirror:{ status:'mirrored'|'exists'|'skipped'|'failed'|'unknown',
//                                 reason?, planHash?, path? }  (#335: best-effort; does NOT
//                                 gate ready_to_run — provisioning is enforced at plan-run entry) }
//   invalid: { handoff_status:'plan_invalid', result:'refuse', errors, validator_verdict }
//            #337 decision-id preflight refusals carry errors prefixed
//            'decision_id_conflict:' plus an additive `conflicts` field ([{id, hits}]).
//
// 2-state only: branch on validator --json `result` ('in-grammar'|'refuse'), NEVER on `decision`.
// decision:ask is audit METADATA that freezes-and-proceeds — NO needs_user_approval, NO --authorized.
//
// Crash-safe write order (binding):
//   1. validator --json  → branch on result. refuse → plan_invalid exit≠0, NO mutation; stop.
//   1.5 decision-id preflight (#337) — read-only; refuse (decision_id_conflict) pre-freeze;
//       skipped when the plan is already frozen or the findDecisionIdHits seam is absent.
//   2. --freeze          → FIRST mutation.
//   3. --resume-check    → integrity gate.
//   4. next-action PURE  → first ready node (ADVISORY; not opened here — adaptive-node.js opens it).
//   5. roadmap init-issue + git add (EEXIST-skips).
//   6. workflow-state.md ## Planning Evidence insert — LAST main-checkout mutation.
//   7. mirror-project (#335) — main→worktree project-folder mirror; mutates ONLY
//      the WORKTREE copy (after 6 so the copy carries the frozen plan + task mirror
//      + PE-updated state). Best-effort: never flips handoff_status.
// ---------------------------------------------------------------------------

const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// getRoot — resolve the USER-REPO root via git rev-parse --show-toplevel
// (process.cwd() fallback). Used ONLY for --project plan/state derivation.
// Mirrors the exact convention in kaola-workflow-active-folders.js and
// kaola-workflow-roadmap.js so the user-repo root resolves correctly even
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
const VALIDATOR     = 'kaola-workflow-plan-validator.js';
const ROADMAP       = 'kaola-workflow-roadmap.js';
const TASK_MIRROR   = 'kaola-workflow-task-mirror.js';
const ADAPTIVE_NODE = 'kaola-workflow-adaptive-node.js';

const validatorPath    = path.join(__dirname, VALIDATOR);
const roadmapPath      = path.join(__dirname, ROADMAP);
const taskMirrorPath   = path.join(__dirname, TASK_MIRROR);
const adaptiveNodePath = path.join(__dirname, ADAPTIVE_NODE);

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
// extractDecisionIdCandidates — #337: collect decision-record ids (D-<n>-<seq>)
// hardcoded in the plan. An occurrence followed by the literal annotation
// "(existing)" is a deliberate reference to an already-shipped record and is
// NOT a candidate; any unannotated occurrence makes the id a candidate.
// Pure; returns deduped ids in first-seen order.
// ---------------------------------------------------------------------------
function extractDecisionIdCandidates(planContent) {
  const out = [];
  const seen = new Set();
  const re = /\bD-(\d+)-(\d+)\b/g;
  const s = String(planContent || '');
  let m;
  while ((m = re.exec(s)) !== null) {
    if (/^\s*\(existing\)/.test(s.slice(m.index + m[0].length))) continue;
    if (!seen.has(m[0])) { seen.add(m[0]); out.push(m[0]); }
  }
  return out;
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
//   findDecisionIdHits {function|undefined} OPTIONAL (#337): (ids: string[]) →
//                   { [id]: string[] /* repo-relative hit paths */ }. Seam for the
//                   step-1.5 decision-id preflight; absent ⇒ check skipped (fail-open).
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

  // -------------------------------------------------------------------------
  // Step 1.5 (#337): decision-record id preflight — freeze-time-once.
  // Skipped when the plan is already frozen (idempotent re-run / resume: the
  // run itself may have legitimately written the record by now) or when the
  // findDecisionIdHits seam is not injected. Refusal happens BEFORE --freeze,
  // so the no-mutation-on-refuse contract holds.
  // -------------------------------------------------------------------------
  if (typeof opts.findDecisionIdHits === 'function') {
    let prePlan = null;
    try { prePlan = readFile(planPath); } catch (_) { /* validator already vetted it */ }
    const alreadyFrozen = /<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(prePlan || '');
    if (prePlan && !alreadyFrozen) {
      const candidates = extractDecisionIdCandidates(prePlan);
      if (candidates.length) {
        let hits = {};
        try { hits = opts.findDecisionIdHits(candidates) || {}; } catch (_) { hits = {}; }
        const conflicts = candidates
          .map(id => ({ id, hits: Array.isArray(hits[id]) ? hits[id] : [] }))
          .filter(c => c.hits.length > 0);
        if (conflicts.length) {
          return {
            handoff_status: 'plan_invalid',
            result: 'refuse',
            errors: conflicts.map(c => {
              const issue = (c.id.match(/^D-(\d+)-/) || [])[1] || 'NN';
              const shown = c.hits.slice(0, 3).join(', ') + (c.hits.length > 3 ? ', …' : '');
              return 'decision_id_conflict: plan hardcodes decision-record id "' + c.id +
                '" but the repo already records it (' + shown + ') — renumber to the next free D-' +
                issue + '-NN, use the D-' + issue + '-NEXT placeholder (the doc-updater node resolves it ' +
                'after reading the existing decision records), or annotate a deliberate reference as "' +
                c.id + ' (existing)"';
            }),
            conflicts,
            validator_verdict: validateResult,
          };
        }
      }
    }
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

  // #282 (AC-1): generate the durable task mirror (workflow-tasks.json) now that the plan is frozen
  // and integrity-checked, so it exists from the first plan-run entry without a manual CLI call.
  // Best-effort, like the roadmap stage below: the executor's orient reconciles it on every resume
  // (#282 AC-2) and the compact-resume hook degrades gracefully when absent, so a non-zero here
  // never blocks ready_to_run.
  shell(taskMirrorPath, ['--project', project]);

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
  // Step 5: roadmap init-issue + git add (EEXIST-skips when no issue_number).
  // roadmap_staged is vacuously true when no issue_number in state.
  // roadmap_staged is ADVISORY/best-effort: a non-EEXIST init-issue failure does
  // NOT block ready_to_run; the finalize sink regenerates the roadmap.
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
  // Step 6: workflow-state.md ## Planning Evidence insert — LAST.
  // State pointer (## Current Position) NOT flipped (startup already set it).
  // first_node_id/role recorded as advisory metadata (node not yet opened here).
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
  // Step 7 (#335): mechanical main→worktree project-folder mirror. The mirrored
  // copy must include the frozen plan (step 2), the durable task mirror (step
  // 3.5), and the PE-updated state (step 6), so this runs LAST. Mutates ONLY the
  // WORKTREE copy (the main-checkout artifacts are already complete; a crash
  // between 6 and 7 is repaired by the idempotent plan-run entry mirror).
  // Best-effort, like roadmap_staged and the task-mirror call: a refuse/failure
  // does NOT flip handoff_status (the plan IS valid — provisioning is enforced
  // at plan-run entry + orient). Skipped cleanly on an in-place run (no worktree).
  // -------------------------------------------------------------------------
  const mirrorResult = shell(adaptiveNodePath, ['mirror-project', '--project', project, '--json']);

  // -------------------------------------------------------------------------
  // Return — ready_to_run (plan-run owns node lifecycle incl. first node)
  // -------------------------------------------------------------------------
  return {
    handoff_status: 'ready_to_run',
    checklist: {
      claim_acquired:    true,
      plan_in_grammar:   true,
      plan_frozen:       true,
      resume_check_ok:   true,
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
    worktree_mirror: {
      status: mirrorResult.status
        || (mirrorResult.exitCode === 0 ? 'unknown' : 'failed'),
      ...(mirrorResult.reason   ? { reason:   mirrorResult.reason }   : {}),
      ...(mirrorResult.planHash ? { planHash: mirrorResult.planHash } : {}),
      ...(mirrorResult.dest     ? { path:     mirrorResult.dest }     : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all process I/O and FS live here.
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(
      'usage: kaola-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json [--state-mtime ISO]\n' +
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
    process.stdout.write('usage: kaola-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json\n');
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

  // #337: default decision-record scanner. Repo root is derived from the plan
  // path (<root>/kaola-workflow/<project>/workflow-plan.md → 3 dirname hops),
  // mirroring the roadmap-file derivation in runHandoff, so --plan invocations
  // from a foreign cwd still scan the PLAN's repo. Scans docs/**/*.md (filename +
  // content, word-bounded) and CHANGELOG.md. Fail-open on any FS error.
  const findDecisionIdHits = ids => {
    const out = {};
    for (const id of ids) out[id] = [];
    const planRepoRoot = path.dirname(path.dirname(path.dirname(planPath)));
    const files = [];
    const stack = [path.join(planRepoRoot, 'docs')];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/\.md$/i.test(e.name)) files.push(p);
      }
    }
    const changelog = path.join(planRepoRoot, 'CHANGELOG.md');
    if (fs.existsSync(changelog)) files.push(changelog);
    for (const f of files) {
      let content = '';
      try { content = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
      for (const id of ids) {
        const re = new RegExp('\\b' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (re.test(path.basename(f)) || re.test(content)) {
          out[id].push(path.relative(planRepoRoot, f));
        }
      }
    }
    return out;
  };

  const resolveModel = role =>
    require('./kaola-workflow-resolve-agent-model').resolveAgentModel(role);

  const shell = (scriptPath, scriptArgs) => shellHandoff(scriptPath, scriptArgs);

  const result = runHandoff({
    planPath,
    statePath,
    project,
    json: true,
    shell,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel,
    readFile:  fpath => fs.readFileSync(fpath, 'utf8'),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content, 'utf8'),
    stateMtime,
    findDecisionIdHits,
  });

  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.handoff_status !== 'ready_to_run') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { runHandoff, shellHandoff, extractDecisionIdCandidates };
