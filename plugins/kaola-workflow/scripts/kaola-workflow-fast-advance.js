#!/usr/bin/env node
'use strict';

// fast-advance.js (#456) — the fast-path transaction owner.
//
// Fast-path transaction owner. Moves the fast path's deterministic mechanical
// transitions out of the `contractor` subagent and into a typed transaction
// script, matching the adaptive path's direct script-owned route (ADR 0004).
//
// The main session (orchestrator) still owns ALL judgment — fast eligibility,
// approach ambiguity, PROCEED vs ESCALATE, acceptance sufficiency, review
// verdict. This script only mutates durable files in crash-safe order and
// emits typed JSON. It never dispatches a role, asks the user, judges severity,
// chooses escalation, or invents write sets.
//
// FORGE-NEUTRAL: this file carries no forge-specific CLI tokens. Command and
// skill route names (the fast / phase1 / research / finalize commands+skills) are
// assembled from the split constant KW below so the dumb rename-normalizer in
// validate-script-sync.js (which rewrites every contiguous `kaola-workflow-<n>`
// token to `kaola-<forge>-workflow-<n>`) cannot mangle them — commands keep
// their name across editions; only scripts get the forge prefix. The result is
// that all four edition copies are byte-identical (adaptive-schema.js precedent).
// (The fast / phase1 / research / finalize command + skill names are all built
// from KW for exactly this reason.)
//
// Subcommands (all require --project <P> and --json):
//   orient                                    read-only; reports derived fast step
//   plan-setup                                .cache + step:plan checkpoint
//   plan-capture --stdin                      fast-summary.md stub (IN_PROGRESS)
//   execute-setup                             step:execute + dispatch descriptor
//   acceptance-run                            run acceptance cmd; facts only
//   acceptance-consequence --decision X       proceed -> review | escalate -> full
//   summary-write --verdict X --stdin         terminal fast-summary.md (once)

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// #504: fast-lane compliance backstop. Reuse the shared helper from repair-state
// (full-path gate at full-advance.js:382) so both lanes call identical logic.
// The require resolves to the edition-correct repair-state via the rename-normalizer
// (kaola-workflow-repair-state -> kaola-{forge}-workflow-repair-state in gitlab/gitea).
const repairState = require('./kaola-workflow-repair-state.js');

// Forge-neutral command/skill prefix. Split so renameNormalize cannot see a
// contiguous `kaola-workflow-` token (see header note). Runtime value is the
// edition-independent `kaola-workflow-`.
const KW = 'kaola' + '-workflow-';

const LEGAL_STATUSES = ['PASSED', 'IN_PROGRESS', 'REVIEW', 'ESCALATED'];
const ESCALATION_TRIGGERS = [
  'approach_ambiguity', 'file_overflow', 'test_thrash', 'security',
  'architecture', 'breaking_change', 'dependency', 'new_package',
];
const EM_DASH = '—'; // U+2014; the fast-audit escalation parser splits on " — "

// ---------------------------------------------------------------------------
// operator_hint registry — one actionable sentence per refusal reason (#445 style)
// ---------------------------------------------------------------------------
const OPERATOR_HINT_REGISTRY = {
  invalid_args: () => 'Bad arguments. Run the subcommand with --project <issue-N> --json (and --stdin / --decision / --verdict where required).',
  invalid_project: () => 'The --project segment is reserved or unsafe (no /, \\, .., and never the literal kaola-workflow). Pass the issue project, e.g. issue-123.',
  unknown_subcommand: (ctx) => 'Unknown subcommand "' + (ctx.detail || '') + '". Use one of: orient, plan-setup, plan-capture, execute-setup, acceptance-run, acceptance-consequence, summary-write.',
  state_missing: () => 'workflow-state.md is absent for this project. Run plan-setup first (or /' + KW + 'fast <project> to (re)enter the fast path).',
  summary_missing: () => 'fast-summary.md is absent. Run plan-capture (after the planner) before this step.',
  corrupt_fast_state: (ctx) => 'fast-summary.md ## Status is not one of ' + LEGAL_STATUSES.join('/') + ' (got "' + (ctx.detail || '?') + '"). Repair the status line or re-run plan-capture.',
  missing_packet: (ctx) => 'The --stdin packet is missing required field(s): ' + (ctx.detail || '') + '. Re-send a complete JSON packet.',
  bad_packet: () => 'The --stdin packet was not parseable JSON. Pipe a single JSON object on stdin.',
  missing_write_set: () => 'plan-capture requires a non-empty write_set in the packet (the orchestrator-judged declared files).',
  missing_acceptance: () => 'plan-capture requires acceptance_command in the packet (the acceptance-check command to run).',
  invalid_decision: () => 'acceptance-consequence requires --decision proceed|escalate.',
  invalid_verdict: () => 'summary-write requires --verdict PASSED|ESCALATED.',
  invalid_trigger: (ctx) => 'Escalation trigger must be one of ' + ESCALATION_TRIGGERS.join('/') + ' (got "' + (ctx.detail || '?') + '").',
  acceptance_unset: () => 'fast-summary.md ## Scope has no "- Acceptance:" command to run. Re-run plan-capture with acceptance_command set.',
  fast_compliance_unresolved: (ctx) => 'summary-write PASSED refused: unresolved compliance row(s): ' + (ctx.detail || 'unknown') + '. Ensure every Required Agent Compliance row has a resolved status (e.g. subagent-invoked, local-fallback-explicit) with a real evidence path or skip_reason before writing PASSED.',
};

function getOperatorHint(reason, ctx) {
  const tmpl = OPERATOR_HINT_REGISTRY[reason];
  const fallback = 'Refusal reason: ' + (reason || 'unknown') + '. Run orient --project <P> --json to inspect fast-path state.';
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

// Extract the `## Sink` block (heading to next `## ` or EOF) byte-for-byte, or ''.
function extractSinkBlock(stateContent) {
  if (!stateContent) return '';
  const lines = stateContent.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Sink\s*$/.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  let block = lines.slice(start, end).join('\n');
  block = block.replace(/\s+$/, ''); // trim trailing blank lines; re-added on render
  return block;
}

// Read a flat `name: value` field from state content.
function stateField(content, name) {
  if (!content) return null;
  const re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.+)$', 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// Parse the fast-summary ## Status (first non-blank line of the section).
function summaryStatus(summaryContent) {
  if (!summaryContent) return null;
  const lines = summaryContent.split('\n');
  let i = 0;
  for (; i < lines.length; i++) { if (/^##\s+Status\s*$/.test(lines[i])) break; }
  if (i >= lines.length) return null;
  for (let j = i + 1; j < lines.length; j++) {
    if (/^##\s/.test(lines[j])) break;
    const t = lines[j].replace(/^[-*\s]+/, '').trim();
    if (t) {
      const up = t.toUpperCase();
      return LEGAL_STATUSES.includes(up) ? up : ('UNKNOWN:' + t);
    }
  }
  return null;
}

// Read the `- Acceptance:` command from the fast-summary ## Scope section.
function summaryAcceptance(summaryContent) {
  if (!summaryContent) return null;
  const m = summaryContent.match(/^\s*-\s*Acceptance:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// renderers
// ---------------------------------------------------------------------------
const STATE_FIELD_ORDER = [
  'phase', 'phase_name', 'step', 'workflow_path', 'next_command', 'next_skill',
  'main_session_role', 'implementation_owner', 'inline_emergency_fallback_authorized',
  'escalated_to_full',
];

// Surgical state update (the claim.js updateState norm): replace each given field
// in place and append a missing one, while preserving EVERY other line and section
// (the rich claim-time `## Project` / `## Current Position` runtime+fix_owner /
// `## Pending Gates` / `## Last Evidence` / `## Last Updated` / `## Sink` blocks)
// byte-for-byte. A whitelist-reconstruct here would silently destroy those sections
// on the first fast-path write and turn the archive normalizations into no-ops.
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

function complianceTable(rows) {
  const header = '| Requirement | Status | Evidence | Skip Reason |\n'
    + '|-------------|--------|----------|-------------|';
  const body = rows.map(r =>
    '| ' + (r.requirement || '') + ' | ' + (r.status || '') + ' | '
    + (r.evidence || '') + ' | ' + (r.skip_reason || '') + ' |').join('\n');
  return header + '\n' + body;
}

function renderSummary(project, parts) {
  const writeSetLine = Array.isArray(parts.write_set)
    ? parts.write_set.join(', ')
    : (parts.write_set || '');
  // #504 (b): the default code-reviewer row must NOT fabricate a green status + fake evidence
  // path — use 'pending' so the fast-lane backstop (runSummaryWrite) catches it as unresolved.
  // Callers that actually completed code review must supply an explicit compliance array.
  const rows = (parts.compliance && parts.compliance.length) ? parts.compliance : [
    { requirement: 'planner', status: 'invoked', evidence: '.cache/planner.md', skip_reason: '' },
    { requirement: 'tdd-guide', status: parts.tdd_status || 'pending', evidence: parts.tdd_evidence || '', skip_reason: '' },
    { requirement: 'code-reviewer', status: parts.reviewer_status || 'pending', evidence: parts.reviewer_evidence || '', skip_reason: '' },
  ];
  return [
    '# Fast Summary: ' + project,
    '',
    '## Status',
    parts.status,
    '',
    '## Scope',
    '- Write Set: ' + writeSetLine,
    '- Acceptance: ' + (parts.acceptance_command || ''),
    '',
    '## Plan',
    parts.plan || '[pending]',
    '',
    '## Implementation Evidence',
    parts.implementation_evidence || '[pending]',
    '',
    '## Review',
    parts.review || '[pending]',
    '',
    '## Required Agent Compliance',
    complianceTable(rows),
    '',
    '## Escalation',
    parts.escalation || 'N/A',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// subcommand implementations
// ---------------------------------------------------------------------------
function planFields(project, step, owner) {
  return {
    phase: 'fast', phase_name: 'Fast', step,
    workflow_path: 'fast',
    next_command: '/' + KW + 'fast ' + project,
    next_skill: KW + 'fast ' + project,
    main_session_role: 'orchestrator',
    implementation_owner: owner,
    inline_emergency_fallback_authorized: 'no',
  };
}

function runOrient(ctx) {
  const stateContent = readFileOr(ctx.statePath, null);
  const summaryContent = readFileOr(ctx.summaryPath, null);
  const status = summaryStatus(summaryContent);
  let fastStep, route;
  if (summaryContent === null) {
    fastStep = 'plan';
    route = '/' + KW + 'fast ' + ctx.project;
  } else if (status === 'IN_PROGRESS') {
    fastStep = 'execute'; route = '/' + KW + 'fast ' + ctx.project;
  } else if (status === 'REVIEW') {
    fastStep = 'review'; route = '/' + KW + 'fast ' + ctx.project;
  } else if (status === 'PASSED') {
    fastStep = 'finalize'; route = '/' + KW + 'finalize ' + ctx.project;
  } else if (status === 'ESCALATED') {
    fastStep = 'escalated'; route = '/' + KW + 'phase1 ' + ctx.project;
  } else {
    return refuse('corrupt_fast_state', { project: ctx.project, detail: status ? String(status).replace(/^UNKNOWN:/, '') : '(empty ## Status)' });
  }
  const stateStep = stateField(stateContent, 'step');
  const stateExpectsStep = (fastStep === 'finalize' || fastStep === 'escalated') ? null : fastStep;
  const statePointerStale = !!(stateStep && stateExpectsStep && stateStep !== stateExpectsStep);
  return {
    result: 'ok',
    project: ctx.project,
    fast_step: fastStep,
    summary_status: status,
    state_step: stateStep,
    state_pointer_stale: statePointerStale,
    next_command: route,
  };
}

function runPlanSetup(ctx) {
  fs.mkdirSync(ctx.cacheDir, { recursive: true });
  const wrote = writeFileAtomic(ctx.statePath, applyStateFields(readFileOr(ctx.statePath, null), planFields(ctx.project, 'plan', 'planner')));
  return { result: 'ok', project: ctx.project, step: 'plan', state_written: wrote, idempotent: !wrote };
}

function runPlanCapture(ctx, packet) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const writeSet = packet.write_set;
  const hasWriteSet = Array.isArray(writeSet) ? writeSet.length > 0 : (typeof writeSet === 'string' && writeSet.trim());
  if (!hasWriteSet) return refuse('missing_write_set', { project: ctx.project });
  if (!packet.acceptance_command || !String(packet.acceptance_command).trim()) {
    return refuse('missing_acceptance', { project: ctx.project });
  }
  // evidence/cache first (planner raw output, if supplied)
  fs.mkdirSync(ctx.cacheDir, { recursive: true });
  if (typeof packet.planner_evidence === 'string' && packet.planner_evidence) {
    writeFileAtomic(path.join(ctx.cacheDir, 'planner.md'), packet.planner_evidence);
  }
  // fast-summary second
  const summary = renderSummary(ctx.project, {
    status: 'IN_PROGRESS',
    write_set: writeSet,
    acceptance_command: String(packet.acceptance_command).trim(),
    plan: packet.plan,
    implementation_evidence: '[pending]',
    review: '[pending]',
    tdd_status: 'pending', tdd_evidence: '',
    reviewer_status: 'pending', reviewer_evidence: '',
    escalation: 'N/A',
  });
  const sWrote = writeFileAtomic(ctx.summaryPath, summary);
  // state pointer to execute LAST
  const stWrote = writeFileAtomic(ctx.statePath, applyStateFields(readFileOr(ctx.statePath, null), planFields(ctx.project, 'execute', 'tdd-guide')));
  return { result: 'ok', project: ctx.project, status: 'IN_PROGRESS', summary_written: sWrote, state_written: stWrote, idempotent: !sWrote && !stWrote };
}

function runExecuteSetup(ctx) {
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  const wrote = writeFileAtomic(ctx.statePath, applyStateFields(existing, planFields(ctx.project, 'execute', 'tdd-guide')));
  return {
    result: 'ok',
    project: ctx.project,
    step: 'execute',
    state_written: wrote,
    idempotent: !wrote,
    dispatch: {
      role: 'tdd-guide',
      evidence_path: 'kaola-workflow/' + ctx.project + '/.cache/tdd-guide.md',
    },
  };
}

function runAcceptanceRun(ctx) {
  const summaryContent = readFileOr(ctx.summaryPath, null);
  if (summaryContent === null) return refuse('summary_missing', { project: ctx.project });
  const cmd = summaryAcceptance(summaryContent);
  if (!cmd) return refuse('acceptance_unset', { project: ctx.project });
  fs.mkdirSync(ctx.cacheDir, { recursive: true });
  // monotonic run counter (resume-safe thrash PROXY; the orchestrator still JUDGES thrash)
  const counterPath = path.join(ctx.cacheDir, 'acceptance-runs.json');
  let prior = 0;
  try { const j = JSON.parse(fs.readFileSync(counterPath, 'utf8')); prior = (j && typeof j.count === 'number') ? j.count : 0; } catch (_) {}
  const repeatCount = prior + 1;
  const res = spawnSync('bash', ['-lc', cmd], { cwd: ctx.cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const exitCode = (res.status === null || res.status === undefined) ? 1 : res.status;
  const evidence = '# Acceptance run ' + repeatCount + '\n\ncommand: ' + cmd + '\nexit_code: ' + exitCode + '\n\n--- stdout (tail) ---\n'
    + tail(res.stdout) + '\n\n--- stderr (tail) ---\n' + tail(res.stderr) + '\n';
  const evidencePath = path.join(ctx.cacheDir, 'acceptance-run.log');
  fs.writeFileSync(evidencePath, evidence, 'utf8');
  fs.writeFileSync(counterPath, JSON.stringify({ count: repeatCount, last_exit: exitCode }) + '\n', 'utf8');
  return {
    result: 'ok',
    project: ctx.project,
    acceptance_command: cmd,
    exit_code: exitCode,
    passed: exitCode === 0,
    repeat_count: repeatCount,
    evidence_path: 'kaola-workflow/' + ctx.project + '/.cache/acceptance-run.log',
  };
}

function tail(s, n) {
  const str = String(s || '');
  const lines = str.split('\n');
  const k = n || 40;
  return lines.length <= k ? str : lines.slice(lines.length - k).join('\n');
}

function setSummaryStatus(summaryContent, newStatus, escalationLine) {
  // Replace the ## Status body line and (optionally) the ## Escalation body.
  let out = summaryContent;
  out = out.replace(/(##\s+Status\s*\n)([^\n]*\n)/, '$1' + newStatus + '\n');
  if (escalationLine !== undefined) {
    if (/##\s+Escalation\s*\n/.test(out)) {
      out = out.replace(/(##\s+Escalation\s*\n)([\s\S]*?)(\n##\s|\s*$)/, '$1' + escalationLine + '\n$3');
    }
  }
  return out;
}

function runAcceptanceConsequence(ctx, decision, packet) {
  if (decision === 'proceed') {
    const summaryContent = readFileOr(ctx.summaryPath, null);
    if (summaryContent === null) return refuse('summary_missing', { project: ctx.project });
    // fast-summary -> REVIEW
    const newSummary = setSummaryStatus(summaryContent, 'REVIEW');
    const sWrote = writeFileAtomic(ctx.summaryPath, newSummary);
    // state -> step:review LAST
    const stWrote = writeFileAtomic(ctx.statePath, applyStateFields(readFileOr(ctx.statePath, null), planFields(ctx.project, 'review', 'code-reviewer')));
    return { result: 'ok', project: ctx.project, decision: 'proceed', status: 'REVIEW', summary_written: sWrote, state_written: stWrote, next_command: '/' + KW + 'fast ' + ctx.project };
  }
  // escalate
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const trigger = packet.trigger;
  if (!trigger) return refuse('missing_packet', { project: ctx.project, detail: 'trigger' });
  if (!ESCALATION_TRIGGERS.includes(trigger)) return refuse('invalid_trigger', { project: ctx.project, detail: String(trigger) });
  const detail = String(packet.detail || '').trim() || '(no detail)';
  const escalatedField = trigger + ' ' + EM_DASH + ' ' + detail;
  const summaryContent = readFileOr(ctx.summaryPath, null);
  if (summaryContent !== null) {
    const newSummary = setSummaryStatus(summaryContent, 'ESCALATED', 'escalated_to_full: ' + escalatedField);
    writeFileAtomic(ctx.summaryPath, newSummary);
  }
  // state -> full routing LAST
  const fields = planFields(ctx.project, 'escalated', 'orchestrator');
  fields.workflow_path = 'full';
  fields.next_command = '/' + KW + 'phase1 ' + ctx.project;
  fields.next_skill = KW + 'research ' + ctx.project;
  fields.escalated_to_full = escalatedField;
  const stWrote = writeFileAtomic(ctx.statePath, applyStateFields(readFileOr(ctx.statePath, null), fields));
  return { result: 'ok', project: ctx.project, decision: 'escalate', status: 'ESCALATED', trigger, state_written: stWrote, next_command: fields.next_command };
}

function runSummaryWrite(ctx, verdict, packet) {
  if (!packet) packet = {};
  const summaryContent = readFileOr(ctx.summaryPath, null);
  if (summaryContent === null) return refuse('summary_missing', { project: ctx.project });
  // keep the stub Scope (Write Set + Acceptance) verbatim
  const writeSet = (summaryContent.match(/^\s*-\s*Write Set:\s*(.+)$/m) || [, ''])[1].trim();
  const acceptance = summaryAcceptance(summaryContent) || '';
  if (verdict === 'PASSED') {
    // #504 (a): fast-lane compliance backstop — mirror the full-path gate (full-advance.js:382).
    // Build the would-be summary first so unresolvedCompliance sees the final compliance table.
    // If any row is unresolved, refuse fail-closed before any mutation.
    const candidateSummary = renderSummary(ctx.project, {
      status: 'PASSED',
      write_set: writeSet,
      acceptance_command: acceptance,
      plan: packet.plan || (summaryContent.match(/##\s+Plan\s*\n([\s\S]*?)\n##\s/) || [, ''])[1].trim() || '[pending]',
      implementation_evidence: packet.implementation_evidence,
      review: packet.review,
      compliance: packet.compliance,
      escalation: 'N/A',
    });
    const stateContent = readFileOr(ctx.statePath, null) || '';
    const unresolved = repairState.unresolvedCompliance(candidateSummary, stateContent);
    if (unresolved.length) {
      return refuse('fast_compliance_unresolved', {
        project: ctx.project,
        detail: unresolved.map(r => r.requirement).join(', '),
        unresolved_rows: unresolved,
      });
    }
    // #504 (c): scope-aware delegation guard — when write_set has >1 file, the code-reviewer row
    // MUST carry a delegation status (subagent-invoked / local-fallback-explicit /
    // local-fallback-tool-unavailable). N/A, invoked-no-evidence, etc. are not sufficient because
    // they do not prove adversarial review was performed on the multi-file change.
    const FAST_DELEGATION_STATUSES = new Set([
      'subagent-invoked', 'local-fallback-explicit', 'local-fallback-tool-unavailable',
    ]);
    const writeSetFiles = writeSet.split(',').map(s => s.trim()).filter(Boolean);
    if (writeSetFiles.length > 1) {
      const complianceRows = (packet.compliance && packet.compliance.length) ? packet.compliance : [];
      const reviewerRow = complianceRows.find(r => /code-reviewer/i.test(r.requirement || ''));
      if (!reviewerRow || !FAST_DELEGATION_STATUSES.has(reviewerRow.status || '')) {
        const badReq = reviewerRow ? reviewerRow.requirement : 'code-reviewer';
        return refuse('fast_compliance_unresolved', {
          project: ctx.project,
          detail: badReq + ' (write_set has ' + writeSetFiles.length + ' files; delegation status required)',
          unresolved_rows: [reviewerRow || { requirement: 'code-reviewer', status: 'missing' }],
        });
      }
    }
    const sWrote = writeFileAtomic(ctx.summaryPath, candidateSummary);
    // route to Finalization (state + summary both agree)
    const fields = planFields(ctx.project, 'review', 'code-reviewer');
    fields.next_command = '/' + KW + 'finalize ' + ctx.project;
    fields.next_skill = KW + 'finalize ' + ctx.project;
    const stWrote = writeFileAtomic(ctx.statePath, applyStateFields(stateContent, fields));
    return { result: 'ok', project: ctx.project, status: 'PASSED', summary_written: sWrote, state_written: stWrote, next_command: fields.next_command };
  }
  // ESCALATED terminal write
  const trigger = packet.trigger;
  if (trigger && !ESCALATION_TRIGGERS.includes(trigger)) return refuse('invalid_trigger', { project: ctx.project, detail: String(trigger) });
  const detail = String(packet.detail || '').trim() || '(no detail)';
  const escalatedField = (trigger ? trigger : 'architecture') + ' ' + EM_DASH + ' ' + detail;
  const summary = renderSummary(ctx.project, {
    status: 'ESCALATED',
    write_set: writeSet,
    acceptance_command: acceptance,
    plan: packet.plan || '[pending]',
    implementation_evidence: packet.implementation_evidence,
    review: packet.review,
    compliance: packet.compliance,
    escalation: 'escalated_to_full: ' + escalatedField,
  });
  const sWrote = writeFileAtomic(ctx.summaryPath, summary);
  const fields = planFields(ctx.project, 'escalated', 'orchestrator');
  fields.workflow_path = 'full';
  fields.next_command = '/' + KW + 'phase1 ' + ctx.project;
  fields.next_skill = KW + 'research ' + ctx.project;
  fields.escalated_to_full = escalatedField;
  const stWrote = writeFileAtomic(ctx.statePath, applyStateFields(readFileOr(ctx.statePath, null), fields));
  return { result: 'ok', project: ctx.project, status: 'ESCALATED', summary_written: sWrote, state_written: stWrote, next_command: fields.next_command };
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
  const decisionIdx = args.indexOf('--decision');
  const verdictIdx = args.indexOf('--verdict');
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
  const known = ['orient', 'plan-setup', 'plan-capture', 'execute-setup', 'acceptance-run', 'acceptance-consequence', 'summary-write'];
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
    summaryPath: path.join(baseDir, 'fast-summary.md'),
    cacheDir: path.join(baseDir, '.cache'),
  };

  let packet = null;
  const needsStdin = hasStdin && (subcommand === 'plan-capture' || subcommand === 'acceptance-consequence' || subcommand === 'summary-write');
  if (needsStdin) {
    let raw = '';
    try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { raw = ''; }
    packet = safeJsonParse(raw);
  }

  let result;
  try {
    if (subcommand === 'orient') {
      result = runOrient(ctx);
    } else if (subcommand === 'plan-setup') {
      result = runPlanSetup(ctx);
    } else if (subcommand === 'plan-capture') {
      if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['plan-capture requires --stdin'] }); }
      else { result = runPlanCapture(ctx, packet); }
    } else if (subcommand === 'execute-setup') {
      result = runExecuteSetup(ctx);
    } else if (subcommand === 'acceptance-run') {
      result = runAcceptanceRun(ctx);
    } else if (subcommand === 'acceptance-consequence') {
      const decision = (decisionIdx >= 0 && decisionIdx + 1 < args.length) ? args[decisionIdx + 1] : null;
      if (decision !== 'proceed' && decision !== 'escalate') { result = refuse('invalid_decision', { project }); }
      else if (decision === 'escalate' && !hasStdin) { result = refuse('invalid_args', { project, errors: ['acceptance-consequence --decision escalate requires --stdin'] }); }
      else { result = runAcceptanceConsequence(ctx, decision, packet); }
    } else if (subcommand === 'summary-write') {
      const verdict = (verdictIdx >= 0 && verdictIdx + 1 < args.length) ? args[verdictIdx + 1] : null;
      if (verdict !== 'PASSED' && verdict !== 'ESCALATED') { result = refuse('invalid_verdict', { project }); }
      else if (!hasStdin) { result = refuse('invalid_args', { project, errors: ['summary-write requires --stdin'] }); }
      else { result = runSummaryWrite(ctx, verdict, packet); }
    }
  } catch (err) {
    result = refuse('invalid_args', { project, errors: ['internal error: ' + (err && err.message ? err.message : String(err))] });
  }
  emit(result);
}

if (require.main === module) main();

module.exports = {
  KW, LEGAL_STATUSES, ESCALATION_TRIGGERS,
  validateProject, extractSinkBlock, summaryStatus, summaryAcceptance,
  applyStateFields, renderSummary, safeJsonParse,
};
