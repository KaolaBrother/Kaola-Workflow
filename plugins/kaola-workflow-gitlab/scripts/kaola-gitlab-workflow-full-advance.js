#!/usr/bin/env node
'use strict';

// full-advance.js (#457) — the full-path phase transaction owner.
//
// Full-path phase transaction owner. Moves the full (6-phase) path's
// deterministic mechanical transitions out of the `contractor` subagent and
// into a typed transaction script, matching the adaptive path's direct
// script-owned route and the fast path's fast-advance.js (ADR 0004).
//
// The main session (orchestrator) still owns ALL judgment — research synthesis,
// approach selection, blueprint completeness, review verdict, severity triage.
// This script only authors the durable phase files from the verbatim content the
// orchestrator hands it and mutates workflow-state.md in crash-safe order,
// emitting typed JSON. It never dispatches a role, asks the user, judges
// severity, re-selects an approach, designs, or invents a write set.
//
// Scope: this script owns the phase 1/2/3/5 checkpoint + phase-file authoring.
//   - Phase 1: state checkpoint only — phase1-research.md is the orchestrator's
//     research synthesis (already on disk; NOT authored here). The per-issue
//     roadmap init-issue + git add stays in the command prose (a direct
//     `node ... init-issue` call against the roadmap script, which resolves to
//     the forge-correct name per edition).
//   - Phase 2/3/5: author the phase file from the orchestrator's verbatim packet,
//     then advance the state pointer.
// Phase 4 (the per-task execute loop + failure ledger) is owned by the separate
// phase4-advance.js transaction (#458).
//
// EDITION SHAPE: command and skill route names (the phase / research / ideation /
// plan / execute / finalize commands+skills) are assembled from the split constant
// KW below so the dumb rename-normalizer in validate-script-sync.js (which rewrites
// every contiguous `kaola-workflow-<n>` token to `kaola-<forge>-workflow-<n>`)
// cannot mangle them — commands and skills keep their name across editions. The
// ONLY contiguous `kaola-workflow-<n>` token is the `require` of the same-edition
// repair-state (for self-validation), which rename-normalizes correctly: the codex
// copy is byte-identical to canonical, and the gitlab/gitea ports carry
// `kaola-<forge>-workflow-repair-state.js`. So this script is rename-normalized per
// edition (like the adaptive aggregators), not KW-split byte-identical.
//
// Subcommands (all require --project <P> and --json):
//   orient                          read-only; reports derived full-path step
//   phase1-complete                 phase 1 -> step:complete checkpoint
//   phase2-finalize --stdin         author phase2-ideation.md + checkpoint
//   phase3-finalize --stdin         author phase3-plan.md + checkpoint
//   phase5-finalize --stdin         author phase5-review.md + checkpoint

const fs = require('fs');
const path = require('path');
// Self-validation against the REAL phase-boundary gate. This require is the ONE
// contiguous `kaola-workflow-<name>` token in the file, so full-advance.js is
// rename-normalized per edition (like the adaptive aggregators) rather than
// KW-split byte-identical: the require resolves to the same-edition repair-state
// (the forge ports carry `kaola-<forge>-workflow-repair-state.js`). Command and
// skill ROUTE names below stay KW-split so they keep their un-prefixed names
// across editions. Reusing the real gate (instead of duplicating its compliance
// vocabulary) keeps the script and the resume/finalize router in lockstep.
const repair = require('./kaola-gitlab-workflow-repair-state.js');

// Forge-neutral command/skill prefix. Split so renameNormalize cannot see a
// contiguous `kaola-workflow-` token (see header note). Runtime value is the
// edition-independent `kaola-workflow-`.
const KW = 'kaola' + '-workflow-';

// delegation_policy -> the compliance status the repair-state delegation
// cross-check accepts for an ACTIVE delegation-controlled row under that policy.
// Used only for the default rows when the orchestrator omits compliance; explicit
// orchestrator rows are transcribed verbatim and then self-validated. Absent/other
// policy -> plain `invoked` (the cross-check is inert when no policy is set).
const POLICY_ACTIVE_STATUS = {
  'delegate': 'subagent-invoked',
  'local-authorized': 'local-fallback-explicit',
  'tool-unavailable': 'local-fallback-tool-unavailable',
};
function defaultActiveStatus(stateContent) {
  const policy = stateField(stateContent, 'delegation_policy');
  return (policy && POLICY_ACTIVE_STATUS[policy]) ? POLICY_ACTIVE_STATUS[policy] : 'invoked';
}

const REVIEW_STATUSES = ['PASSED', 'PASSED WITH FOLLOW-UPS'];

// ---------------------------------------------------------------------------
// operator_hint registry — one actionable sentence per refusal reason (#445 style)
// ---------------------------------------------------------------------------
const OPERATOR_HINT_REGISTRY = {
  invalid_args: () => 'Bad arguments. Run the subcommand with --project <issue-N> --json (and --stdin where required).',
  invalid_project: () => 'The --project segment is reserved or unsafe (no /, \\, .., and never the literal kaola-workflow). Pass the issue project, e.g. issue-123.',
  unknown_subcommand: (ctx) => 'Unknown subcommand "' + (ctx.detail || '') + '". Use one of: orient, phase1-complete, phase2-finalize, phase3-finalize, phase5-finalize.',
  state_missing: () => 'workflow-state.md is absent for this project. Claim/startup the project first (the full path checkpoints an already-claimed state).',
  research_missing: () => 'phase1-research.md is absent. Author the Phase 1 research synthesis on disk before running phase1-complete (this script never authors it).',
  bad_packet: () => 'The --stdin packet was not parseable JSON. Pipe a single JSON object on stdin.',
  invalid_review_status: (ctx) => 'phase5-finalize requires review_status to be one of ' + REVIEW_STATUSES.join(' | ') + ' (got "' + (ctx.detail || '?') + '").',
  bad_compliance: (ctx) => 'The compliance packet field must be an array of {requirement,status,...} rows (offending: ' + (ctx.detail || '') + ').',
  unresolved_compliance: (ctx) => 'The rendered phase file would FAIL the repair-state phase-boundary gate (unresolved: ' + (ctx.detail || '') + '). Supply compliance rows that resolve under this project\'s delegation_policy — `invoked`/`subagent-invoked`/`local-fallback-explicit`/`local-fallback-tool-unavailable` WITH an evidence path, or `n/a` WITH a skip reason. No file was written.',
};

function getOperatorHint(reason, ctx) {
  const tmpl = OPERATOR_HINT_REGISTRY[reason];
  const fallback = 'Refusal reason: ' + (reason || 'unknown') + '. Run orient --project <P> --json to inspect full-path state.';
  if (typeof tmpl !== 'function') return fallback;
  try {
    const out = tmpl(ctx || {});
    return (typeof out === 'string' && out.trim()) ? out : fallback;
  } catch (_) { return fallback; }
}

function refuse(reason, extra) {
  const out = Object.assign({ result: 'refuse', reason }, extra || {});
  out.operator_hint = getOperatorHint(reason, out);
  return out;
}

// ---------------------------------------------------------------------------
// small filesystem + parsing helpers (inline; no kaola-script requires)
// ---------------------------------------------------------------------------
function readFileOr(p, dflt) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return dflt; }
}

// Crash-safe atomic replace: temp + fsync + rename. Idempotent: returns false
// (no write) when the on-disk content already matches.
function writeFileAtomic(filePath, content) {
  let existing = null;
  try { existing = fs.readFileSync(filePath, 'utf8'); } catch (_) {}
  if (existing === content) return false;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.' + Math.random().toString(16).slice(2) + '.tmp');
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
  return true;
}

function safeJsonParse(str) {
  const s = String(str || '');
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
  } catch (_) {}
  // tolerate trailing/leading noise: accept the last line that is a JSON object
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const p = JSON.parse(lines[i]);
      if (typeof p === 'object' && p !== null && !Array.isArray(p)) return p;
    } catch (_) {}
  }
  return null;
}

// project name: reject path traversal + the reserved literal
function validateProject(project) {
  if (!project || typeof project !== 'string') return false;
  if (project === 'kaola-workflow') return false;
  if (project === '.' || project === '..') return false;
  if (/[\\/]/.test(project)) return false;
  if (project.includes('..')) return false;
  if (project.startsWith('.')) return false;
  return true;
}

// Read a flat `name: value` field from state content.
function stateField(content, name) {
  if (!content) return null;
  const re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.+)$', 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// renderers
// ---------------------------------------------------------------------------
const STATE_FIELD_ORDER = [
  'phase', 'phase_name', 'step', 'workflow_path', 'next_command', 'next_skill',
  'main_session_role', 'implementation_owner', 'inline_emergency_fallback_authorized',
];

// Surgical state update (the claim.js updateState norm): replace each given field
// in place and append a missing one, while preserving EVERY other line and section
// (the rich claim-time `## Project` / `## Current Position` runtime+fix_owner /
// `## Pending Gates` / `## Last Evidence` / `## Last Updated` / `## Sink` blocks)
// byte-for-byte. A whitelist-reconstruct here would silently destroy those sections
// on the first full-path write and turn the archive normalizations into no-ops.
// Builds a minimal flat state only when no prior state file exists.
function applyStateFields(existing, fields) {
  if (!existing || !existing.trim()) {
    const lines = [];
    for (const k of STATE_FIELD_ORDER) {
      if (fields[k] !== undefined && fields[k] !== null) lines.push(k + ': ' + fields[k]);
    }
    return lines.join('\n') + '\n';
  }
  let out = existing;
  const missing = [];
  for (const k of STATE_FIELD_ORDER) {
    const v = fields[k];
    if (v === undefined || v === null) continue;
    const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*.*$', 'm');
    if (re.test(out)) out = out.replace(re, k + ': ' + v);
    else missing.push(k + ': ' + v);
  }
  if (missing.length) {
    const block = missing.join('\n') + '\n';
    if (/^## Pending Gates[ \t]*$/m.test(out)) {
      out = out.replace(/^(## Pending Gates[ \t]*)$/m, block + '$1');
    } else if (/^## Sink[ \t]*$/m.test(out)) {
      out = out.replace(/^(## Sink[ \t]*)$/m, block + '$1');
    } else {
      out = out.replace(/\s*$/, '\n') + block;
    }
  }
  return out;
}

// Render the `## Required Agent Compliance` table. Rows are the orchestrator's
// verbatim packet (or a resolved default). The repair-state.js phase-boundary
// gate (unresolvedCompliance) blocks the crossing unless every row is RESOLVED:
// `invoked` WITH evidence, or `n/a`/`skipped` WITH evidence or skip_reason.
function complianceTable(rows) {
  const header = '| Requirement | Status | Evidence | Skip Reason |\n'
    + '|-------------|--------|----------|-------------|';
  const body = rows.map(r =>
    '| ' + (r.requirement || '') + ' | ' + (r.status || '') + ' | '
    + (r.evidence || '') + ' | ' + (r.skip_reason || '') + ' |').join('\n');
  return header + '\n' + body;
}

// Coerce a packet compliance value into the row shape, or null if not an array.
function normalizeCompliance(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return undefined; // signals bad_compliance
  return value.map(r => ({
    requirement: r && r.requirement != null ? String(r.requirement) : '',
    status: r && r.status != null ? String(r.status) : '',
    evidence: r && r.evidence != null ? String(r.evidence) : '',
    skip_reason: r && (r.skip_reason != null ? r.skip_reason : r.skipReason) != null
      ? String(r.skip_reason != null ? r.skip_reason : r.skipReason) : '',
  }));
}

function renderIdeation(project, parts) {
  return [
    '# Phase 2 - Ideation: ' + project,
    '',
    '## Approaches Evaluated',
    parts.approaches_evaluated || '[pending]',
    '',
    '## Selected Approach',
    parts.selected_approach || '[pending]',
    '',
    '## Out of Scope (explicit)',
    parts.out_of_scope || 'none',
    '',
    '## Required Agent Compliance',
    complianceTable(parts.compliance),
    '',
  ].join('\n');
}

function renderPlan(project, parts) {
  return [
    '# Phase 3 - Plan: ' + project,
    '',
    '## Blueprint',
    parts.blueprint || '[pending]',
    '',
    '## Task List',
    parts.task_list || '[pending]',
    '',
    '## Required Agent Compliance',
    complianceTable(parts.compliance),
    '',
  ].join('\n');
}

function renderReview(project, parts) {
  return [
    '# Phase 5 - Review: ' + project,
    '',
    '## Code Review Findings',
    parts.code_review_findings || 'none',
    '',
    '## Security Review',
    parts.security_review || 'ran: no and reason: no security-sensitive files in write set',
    '',
    '## Required Agent Compliance',
    complianceTable(parts.compliance),
    '',
    '## Fixes Applied',
    parts.fixes_applied || 'none',
    '',
    '## Validation Evidence',
    parts.validation_evidence || '[pending]',
    '',
    '## Follow-Up Items',
    parts.followups || 'none',
    '',
    '## Review Status',
    parts.review_status,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// state checkpoints
// ---------------------------------------------------------------------------
// Each phase transition only TOUCHES the fields the transition changes (phase,
// phase_name, step, next_command, next_skill). Every other field claim.js set
// (workflow_path, main_session_role, the ## Sink block, etc.) is preserved by
// applyStateFields. The phase->skill route map mirrors repair-state.js:
//   1 research, 2 ideation, 3 plan, 4 execute, 5 review, 6 finalize.
function checkpointFields(project, phase, phaseName, nextPhaseCmd, nextSkill) {
  return {
    phase: phase,
    phase_name: phaseName,
    step: 'complete',
    next_command: '/' + KW + nextPhaseCmd + ' ' + project,
    next_skill: KW + nextSkill + ' ' + project,
  };
}

// ---------------------------------------------------------------------------
// subcommand implementations
// ---------------------------------------------------------------------------
function runOrient(ctx) {
  const stateContent = readFileOr(ctx.statePath, null);
  const files = {
    research: fs.existsSync(ctx.researchPath),
    ideation: fs.existsSync(ctx.ideationPath),
    plan: fs.existsSync(ctx.planPath),
    progress: fs.existsSync(ctx.progressPath),
    review: fs.existsSync(ctx.reviewPath),
  };
  // Derive the next full-path step from the highest phase artifact present.
  let fullStep, route;
  if (files.review) { fullStep = 'finalize'; route = '/' + KW + 'finalize ' + ctx.project; }
  else if (files.progress) { fullStep = 'review'; route = '/' + KW + 'phase5 ' + ctx.project; }
  else if (files.plan) { fullStep = 'execute'; route = '/' + KW + 'phase4 ' + ctx.project; }
  else if (files.ideation) { fullStep = 'plan'; route = '/' + KW + 'phase3 ' + ctx.project; }
  else if (files.research) { fullStep = 'ideation'; route = '/' + KW + 'phase2 ' + ctx.project; }
  else { fullStep = 'research'; route = '/' + KW + 'phase1 ' + ctx.project; }
  return {
    result: 'ok',
    project: ctx.project,
    full_step: fullStep,
    phase: stateField(stateContent, 'phase'),
    step: stateField(stateContent, 'step'),
    phase_files: files,
    next_command: route,
  };
}

function runPhase1Complete(ctx) {
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  if (!fs.existsSync(ctx.researchPath)) return refuse('research_missing', { project: ctx.project });
  const fields = checkpointFields(ctx.project, '1', 'Research', 'phase2', 'ideation');
  const wrote = writeFileAtomic(ctx.statePath, applyStateFields(existing, fields));
  return { result: 'ok', project: ctx.project, phase: 1, step: 'complete', state_written: wrote, idempotent: !wrote, next_command: fields.next_command };
}

// Shared phase-file finalizer: SELF-VALIDATE the rendered phase file against the
// real repair-state phase-boundary gate (unresolvedCompliance, checked WITH the
// live state for the delegation_policy cross-check — exactly as route() /
// routeFinalization() do downstream), fail closed with zero mutation if it would
// not pass, THEN author the phase FILE and advance the state pointer LAST
// (crash-safe: a crash leaves the phase file written and the pointer un-advanced
// -> resume re-runs idempotently and converges to a gate-PASSING state).
function finalizePhase(ctx, opts) {
  const existing = opts.existing;
  if (existing === null || existing === undefined) return refuse('state_missing', { project: ctx.project });
  const unresolved = repair.unresolvedCompliance(opts.content, existing);
  if (unresolved.length) {
    return refuse('unresolved_compliance', { project: ctx.project, detail: unresolved.map(r => r.requirement).join(', ') });
  }
  const fileWrote = writeFileAtomic(opts.filePath, opts.content);
  const stWrote = writeFileAtomic(ctx.statePath, applyStateFields(existing, opts.fields));
  return {
    result: 'ok',
    project: ctx.project,
    phase: opts.phaseNum,
    step: 'complete',
    phase_file_written: fileWrote,
    state_written: stWrote,
    idempotent: !fileWrote && !stWrote,
    next_command: opts.fields.next_command,
  };
}

function runPhase2Finalize(ctx, packet) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  let compliance = normalizeCompliance(packet.compliance);
  if (compliance === undefined) return refuse('bad_compliance', { project: ctx.project, detail: 'compliance' });
  if (compliance === null) {
    compliance = [{ requirement: 'planner', status: defaultActiveStatus(existing), evidence: '.cache/planner.md', skip_reason: '' }];
  }
  const content = renderIdeation(ctx.project, {
    approaches_evaluated: packet.approaches_evaluated,
    selected_approach: packet.selected_approach,
    out_of_scope: packet.out_of_scope,
    compliance: compliance,
  });
  const fields = checkpointFields(ctx.project, '2', 'Ideation', 'phase3', 'plan');
  return finalizePhase(ctx, { existing, phaseNum: 2, filePath: ctx.ideationPath, content, fields });
}

function runPhase3Finalize(ctx, packet) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  let compliance = normalizeCompliance(packet.compliance);
  if (compliance === undefined) return refuse('bad_compliance', { project: ctx.project, detail: 'compliance' });
  if (compliance === null) {
    compliance = [
      { requirement: 'code-architect', status: defaultActiveStatus(existing), evidence: '.cache/architect.md', skip_reason: '' },
      { requirement: 'architect revisions', status: 'n/a', evidence: '', skip_reason: 'no revision needed' },
    ];
  }
  const content = renderPlan(ctx.project, {
    blueprint: packet.blueprint,
    task_list: packet.task_list,
    compliance: compliance,
  });
  const fields = checkpointFields(ctx.project, '3', 'Plan', 'phase4', 'execute');
  return finalizePhase(ctx, { existing, phaseNum: 3, filePath: ctx.planPath, content, fields });
}

function runPhase5Finalize(ctx, packet) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  const reviewStatus = packet.review_status != null ? String(packet.review_status).trim() : '';
  if (!REVIEW_STATUSES.includes(reviewStatus)) {
    return refuse('invalid_review_status', { project: ctx.project, detail: reviewStatus || '(missing)' });
  }
  let compliance = normalizeCompliance(packet.compliance);
  if (compliance === undefined) return refuse('bad_compliance', { project: ctx.project, detail: 'compliance' });
  if (compliance === null) {
    compliance = [
      { requirement: 'code-reviewer', status: defaultActiveStatus(existing), evidence: '.cache/code-reviewer.md', skip_reason: '' },
      { requirement: 'security-reviewer', status: 'n/a', evidence: '', skip_reason: 'no security-sensitive files in write set' },
      { requirement: 'review-fix executors', status: 'n/a', evidence: '', skip_reason: 'no CRITICAL/HIGH findings' },
    ];
  }
  const content = renderReview(ctx.project, {
    code_review_findings: packet.code_review_findings,
    security_review: packet.security_review,
    fixes_applied: packet.fixes_applied,
    validation_evidence: packet.validation_evidence,
    followups: packet.followups,
    review_status: reviewStatus,
    compliance: compliance,
  });
  const fields = checkpointFields(ctx.project, '5', 'Review', 'finalize', 'finalize');
  return finalizePhase(ctx, { existing, phaseNum: 5, filePath: ctx.reviewPath, content, fields });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  const hasJson = args.includes('--json');
  const hasStdin = args.includes('--stdin');
  const projectIdx = args.indexOf('--project');
  const rootIdx = args.indexOf('--root');

  function emit(result) {
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result && result.result === 'refuse') process.exitCode = 1;
  }

  if (!hasJson) {
    emit(refuse('invalid_args', { errors: ['--json is required'] }));
    return;
  }
  if (!subcommand || subcommand.startsWith('--')) {
    emit(refuse('invalid_args', { errors: ['subcommand is required'] }));
    return;
  }
  const known = ['orient', 'phase1-complete', 'phase2-finalize', 'phase3-finalize', 'phase5-finalize'];
  if (!known.includes(subcommand)) {
    emit(refuse('unknown_subcommand', { detail: subcommand }));
    return;
  }
  const project = (projectIdx >= 0 && projectIdx + 1 < args.length) ? args[projectIdx + 1] : null;
  if (!project) { emit(refuse('invalid_args', { errors: ['--project is required'] })); return; }
  if (!validateProject(project)) { emit(refuse('invalid_project', { project })); return; }

  const root = (rootIdx >= 0 && rootIdx + 1 < args.length) ? args[rootIdx + 1] : process.cwd();
  const baseDir = path.join(root, 'kaola-workflow', project);
  const ctx = {
    project, cwd: root,
    statePath: path.join(baseDir, 'workflow-state.md'),
    researchPath: path.join(baseDir, 'phase1-research.md'),
    ideationPath: path.join(baseDir, 'phase2-ideation.md'),
    planPath: path.join(baseDir, 'phase3-plan.md'),
    progressPath: path.join(baseDir, 'phase4-progress.md'),
    reviewPath: path.join(baseDir, 'phase5-review.md'),
    cacheDir: path.join(baseDir, '.cache'),
  };

  let packet = null;
  const needsStdin = hasStdin && (subcommand === 'phase2-finalize' || subcommand === 'phase3-finalize' || subcommand === 'phase5-finalize');
  if (needsStdin) {
    let raw = '';
    try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { raw = ''; }
    packet = safeJsonParse(raw);
  }

  let result;
  try {
    if (subcommand === 'orient') {
      result = runOrient(ctx);
    } else if (subcommand === 'phase1-complete') {
      result = runPhase1Complete(ctx);
    } else if (subcommand === 'phase2-finalize') {
      if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['phase2-finalize requires --stdin'] }); }
      else { result = runPhase2Finalize(ctx, packet); }
    } else if (subcommand === 'phase3-finalize') {
      if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['phase3-finalize requires --stdin'] }); }
      else { result = runPhase3Finalize(ctx, packet); }
    } else if (subcommand === 'phase5-finalize') {
      if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['phase5-finalize requires --stdin'] }); }
      else { result = runPhase5Finalize(ctx, packet); }
    }
  } catch (err) {
    result = refuse('invalid_args', { project, errors: ['internal error: ' + (err && err.message ? err.message : String(err))] });
  }
  emit(result);
}

if (require.main === module) main();

module.exports = {
  KW, REVIEW_STATUSES,
  validateProject, stateField, safeJsonParse,
  applyStateFields, normalizeCompliance, complianceTable,
  renderIdeation, renderPlan, renderReview,
};
