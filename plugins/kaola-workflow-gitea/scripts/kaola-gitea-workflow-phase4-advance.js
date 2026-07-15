#!/usr/bin/env node
'use strict';

// phase4-advance.js (#458) — the full-path Phase 4 (Execute) transaction owner.
//
// Moves Phase 4's deterministic mechanical bookkeeping out of the `contractor`
// subagent into a typed transaction (ADR 0004), matching full-advance.js (#457,
// phases 1/2/3/5) and fast-advance.js (#456). Phase 4 is the per-task execute
// loop: a progress ledger (phase4-progress.md) with one row per Phase 3 task, a
// Failure Routing Ledger, and a per-task `tdd-guide executor task N` compliance
// row. The main session owns ALL judgment (task dispatch, result verification,
// failure classification + route selection, the validation-passed verdict); this
// script only stamps the progress file from phase3-plan.md and transcribes the
// orchestrator's verbatim per-task outcomes + advances the state pointer.
//
// Subcommands (all require --project <P> and --json):
//   orient                          read-only; first-open task / all-complete / route
//   init-progress                   stamp phase4-progress.md from phase3-plan.md (create-only)
//   open-task --task N              workflow-state pointer -> step:delegate-task/task:N
//   record-failure --task N --stdin append one Failure Routing Ledger row (verbatim)
//   close-task --task N --stdin     mark task N complete + flip its compliance row + advance
//
// EDITION SHAPE: command/skill ROUTE names are KW-split (forge-neutral). The ONLY
// contiguous `kaola-workflow-<name>` token is the `require` of the same-edition
// repair-state (for self-validating the phase4->5 boundary compliance gate), which
// rename-normalizes per edition exactly like full-advance.js — so this script is
// rename-normalized (codex byte-identical to canonical; gitlab/gitea carry
// `kaola-<forge>-workflow-repair-state.js`), NOT KW-split byte-identical.

const fs = require('fs');
const path = require('path');
// Self-validation against the REAL phase-boundary gate (see header). The phase4->5
// crossing runs repair-state.unresolvedCompliance(phase4-progress, state), and the
// `tdd-guide executor task N` rows are delegation-controlled — so close-task must
// emit a delegation-vocabulary status under an active delegation_policy or the
// boundary would brick. We reuse the real gate instead of duplicating its vocab.
const repair = require('./kaola-gitea-workflow-repair-state.js');

const KW = 'kaola' + '-workflow-';

// delegation_policy -> the compliance status the delegation cross-check accepts for
// an ACTIVE delegation-controlled row under that policy (mirrors full-advance.js).
const POLICY_ACTIVE_STATUS = {
  'delegate': 'subagent-invoked',
  'local-authorized': 'local-fallback-explicit',
  'tool-unavailable': 'local-fallback-tool-unavailable',
};
function defaultActiveStatus(stateContent) {
  const policy = stateField(stateContent, 'delegation_policy');
  return (policy && POLICY_ACTIVE_STATUS[policy]) ? POLICY_ACTIVE_STATUS[policy] : 'invoked';
}

// ---------------------------------------------------------------------------
// operator_hint registry
// ---------------------------------------------------------------------------
const OPERATOR_HINT_REGISTRY = {
  invalid_args: () => 'Bad arguments. Run the subcommand with --project <issue-N> --json (and --task N / --stdin where required).',
  invalid_project: () => 'The --project segment is reserved or unsafe (no /, \\, .., and never the literal kaola-workflow). Pass the issue project, e.g. issue-123.',
  unknown_subcommand: (ctx) => 'Unknown subcommand "' + (ctx.detail || '') + '". Use one of: orient, init-progress, open-task, record-failure, close-task.',
  state_missing: () => 'workflow-state.md is absent for this project. Claim/startup the project and reach Phase 4 first.',
  plan_missing: () => 'phase3-plan.md is absent. Run Phase 3 (it authors the task list) before init-progress.',
  no_tasks: () => 'phase3-plan.md has no `### Task N:` blocks under `## Task List`. The plan must declare at least one task.',
  progress_missing: () => 'phase4-progress.md is absent. Run init-progress first (it stamps the per-task ledger from phase3-plan.md).',
  invalid_task: (ctx) => 'The --task value must be a positive integer that exists in phase4-progress.md (got "' + (ctx.detail || '?') + '").',
  bad_packet: () => 'The --stdin packet was not parseable JSON. Pipe a single JSON object on stdin.',
  missing_field: (ctx) => 'The --stdin packet is missing required field(s): ' + (ctx.detail || '') + '.',
  unresolved_compliance: (ctx) => 'Closing the LAST task would leave the phase4->5 boundary gate red (unresolved: ' + (ctx.detail || '') + '). Resolve every `tdd-guide executor task N` row (a delegation-vocabulary status WITH evidence, or n/a WITH a skip reason) before closing the final task. No mutation was made.',
};

function getOperatorHint(reason, ctx) {
  const tmpl = OPERATOR_HINT_REGISTRY[reason];
  const fallback = 'Refusal reason: ' + (reason || 'unknown') + '. Run orient --project <P> --json to inspect Phase 4 state.';
  if (typeof tmpl !== 'function') return fallback;
  try { const out = tmpl(ctx || {}); return (typeof out === 'string' && out.trim()) ? out : fallback; }
  catch (_) { return fallback; }
}

function refuse(reason, extra) {
  const out = Object.assign({ result: 'refuse', reason }, extra || {});
  out.operator_hint = getOperatorHint(reason, out);
  return out;
}

// ---------------------------------------------------------------------------
// fs + parse helpers (inline; mirrors full-advance.js)
// ---------------------------------------------------------------------------
function readFileOr(p, dflt) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return dflt; } }

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
  // #689 (same gap #685 fixed on the adaptive path's writeFileAtomicReplace): fsync the PARENT
  // DIRECTORY after the rename settles — on POSIX filesystems a rename's directory-entry update is
  // not itself durable until the containing directory is fsynced, so without this a settled write can
  // still revert to the pre-rename entry after power loss even though the tmp file's own contents were
  // fsynced above. Platform fail-soft is a HARD requirement: some platforms/filesystems refuse to open
  // or fsync a directory (Windows, EISDIR/EACCES/EINVAL) — degrade silently rather than turning a
  // previously-accepted write into a refusal; nothing in this block may rethrow or affect the return value.
  let dirFd;
  try {
    dirFd = fs.openSync(dir, 'r');
    fs.fsyncSync(dirFd);
  } catch (_) {
    // fail-soft: directory fsync unsupported/denied here — the rename above already succeeded.
  } finally {
    if (dirFd !== undefined) { try { fs.closeSync(dirFd); } catch (_) {} }
  }
  return true;
}

// Idempotent progress write: skip if the only difference from disk is the
// `## Last Updated` timestamp body (so a true no-op re-run does not bump it).
function writeProgressIdempotent(filePath, content) {
  const existing = readFileOr(filePath, null);
  if (existing !== null && normalizeUpdated(existing) === normalizeUpdated(content)) return false;
  return writeFileAtomic(filePath, content);
}
function normalizeUpdated(s) {
  return s.replace(/(##\s+Last Updated\s*\n)([^\n]*)/, '$1<NORMALIZED>');
}

function safeJsonParse(str) {
  const s = String(str || '');
  try { const p = JSON.parse(s); if (typeof p === 'object' && p !== null && !Array.isArray(p)) return p; } catch (_) {}
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const p = JSON.parse(lines[i]); if (typeof p === 'object' && p !== null && !Array.isArray(p)) return p; } catch (_) {}
  }
  return null;
}

function validateProject(project) {
  if (!project || typeof project !== 'string') return false;
  if (project === 'kaola-workflow') return false;
  if (project === '.' || project === '..') return false;
  if (/[\\/]/.test(project)) return false;
  if (project.includes('..')) return false;
  if (project.startsWith('.')) return false;
  return true;
}

function stateField(content, name) {
  if (!content) return null;
  const re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.+)$', 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// state checkpoint (surgical; preserve every other section incl. ## Sink)
// ---------------------------------------------------------------------------
const STATE_FIELD_ORDER = [
  'phase', 'phase_name', 'step', 'task', 'workflow_path', 'next_command', 'next_skill',
  'main_session_role', 'implementation_owner', 'inline_emergency_fallback_authorized',
];
function applyStateFields(existing, fields) {
  if (!existing || !existing.trim()) {
    const lines = [];
    for (const k of STATE_FIELD_ORDER) if (fields[k] !== undefined && fields[k] !== null) lines.push(k + ': ' + fields[k]);
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
    if (/^## Pending Gates[ \t]*$/m.test(out)) out = out.replace(/^(## Pending Gates[ \t]*)$/m, block + '$1');
    else if (/^## Sink[ \t]*$/m.test(out)) out = out.replace(/^(## Sink[ \t]*)$/m, block + '$1');
    else out = out.replace(/\s*$/, '\n') + block;
  }
  return out;
}

// ---------------------------------------------------------------------------
// phase3-plan.md task parsing + phase4-progress.md rendering / editing
// ---------------------------------------------------------------------------
// Parse `### Task N: <name>` blocks under `## Task List`. 1:1 phase3 task N -> phase4 task N.
function parsePlanTasks(planContent) {
  const tasks = [];
  if (!planContent) return tasks;
  const re = /^###\s+Task\s+([0-9]+)\s*:\s*(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(planContent)) !== null) {
    tasks.push({ id: m[1], name: m[2].trim() });
  }
  return tasks;
}

// Sanitize a value for a pipe-delimited markdown table cell. Both this script's
// naive split('|') parsers AND repair-state.taskRows()/complianceRows() split on
// every raw '|', so a literal pipe (or newline) in an orchestrator-supplied value
// — a task name like "support a|b syntax", a file path, an evidence note — would
// shift columns and durably corrupt the table (mis-read Status, mis-routed open
// task). Replace '|' with the visually-identical fullwidth '｜' (U+FF5C, not a
// delimiter) and collapse newlines so every cell stays single-column.
function cell(v) {
  return String(v == null ? '' : v).replace(/\r?\n/g, ' ').replace(/\|/g, '｜');
}

const GUARDRAILS = [
  '## Operational Guardrails',
  '',
  'Phase 4 is subagent-executed.',
  '',
  'Main session may:',
  '- inspect diffs',
  '- run small targeted validation commands',
  '- delegate expensive or noisy validation',
  '- classify failures',
  '- update progress/evidence files',
  '- delegate follow-up fixes',
  '- apply the Trivial Inline Edit Exception',
  '',
  'Main session must not:',
  '- write implementation fixes inline except under the Trivial Inline Edit Exception',
  '- write or rewrite tests inline except under the Trivial Inline Edit Exception',
  '- mark a task complete while validation fails',
  '',
  'Failure routing:',
  '- behavior/test failure -> tdd-guide',
  '- build/type/lint/tooling failure -> build-error-resolver',
  '- scope/write-set violation -> stop or escalate',
  '- emergency inline fallback -> only with explicit user authorization',
].join('\n');

function renderProgress(project, tasks, nowIso) {
  const taskRows = tasks.map(t => '| ' + cell(t.id) + ' | ' + cell(t.name) + ' | pending | | |').join('\n');
  const complianceRows = tasks.map(t => '| tdd-guide executor task ' + cell(t.id) + ' | pending | | |').join('\n');
  return [
    '# Phase 4 - Progress: ' + project,
    '',
    GUARDRAILS,
    '',
    '## Tasks',
    '| # | Name | Status | Files Modified | Notes |',
    '|---|------|--------|----------------|-------|',
    taskRows,
    '',
    '## Build Status',
    'clean',
    '',
    '## Failure Routing Ledger',
    '| Task | Failing Command | Classification | Routed To | Evidence | Status |',
    '|------|-----------------|----------------|-----------|----------|--------|',
    '',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    complianceRows,
    '',
    '## Last Updated',
    nowIso,
    '',
  ].join('\n');
}

// Replace the single-line body of a `## <heading>` section. Uses a function
// replacer so `$1`/`$&`/`$<n>` tokens in the orchestrator-supplied value (e.g. a
// Build Status note "failing: cost $1 fix") are NOT interpreted as replacement
// patterns — they would otherwise splice the captured heading into the body.
function setSectionLine(content, heading, value) {
  const re = new RegExp('(##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n)([^\\n]*)');
  if (re.test(content)) return content.replace(re, (_m, p1) => p1 + String(value == null ? '' : value));
  return content;
}

// Parse the DATA rows of a markdown table inside a `## <heading>` section (the
// header + separator are skipped — data is everything after the separator line).
function tableRows(content, heading) {
  const start = content.search(new RegExp('^##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm'));
  if (start === -1) return [];
  const rest = content.slice(start).split(/\r?\n/).slice(1);
  const out = [];
  let seenSep = false;
  for (const line of rest) {
    if (/^##\s+/.test(line)) break;
    const t = line.trim();
    if (!/^\|.+\|$/.test(t)) continue;
    const cols = t.split('|').slice(1, -1).map(c => c.trim());
    if (cols.every(c => /^-+$/.test(c))) { seenSep = true; continue; } // separator -> data follows
    if (!seenSep) continue;                                            // header row (pre-separator)
    out.push(cols);
  }
  return out;
}

// Rewrite one `## Tasks` row (by id) preserving all others. cols: [#, Name, Status, Files, Notes].
function setTaskRow(content, id, status, files) {
  const lines = content.split('\n');
  let inTasks = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Tasks\s*$/.test(lines[i])) { inTasks = true; continue; }
    if (inTasks && /^##\s+/.test(lines[i])) break;
    if (!inTasks) continue;
    const t = lines[i].trim();
    if (!/^\|.+\|$/.test(t)) continue;
    const cols = t.split('|').slice(1, -1).map(c => c.trim());
    if (cols[0] === String(id)) {
      cols[2] = status;
      if (files !== undefined && files !== null) cols[3] = cell(files);
      lines[i] = '| ' + cols.join(' | ') + ' |';
      break;
    }
  }
  return lines.join('\n');
}

// Flip a `## Required Agent Compliance` row (by requirement) -> status/evidence/skip.
function setComplianceRow(content, requirement, status, evidence, skipReason) {
  const lines = content.split('\n');
  let inSec = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Required Agent Compliance\s*$/.test(lines[i])) { inSec = true; continue; }
    if (inSec && /^##\s+/.test(lines[i])) break;
    if (!inSec) continue;
    const t = lines[i].trim();
    if (!/^\|.+\|$/.test(t)) continue;
    const cols = t.split('|').slice(1, -1).map(c => c.trim());
    if (cols[0] === requirement) {
      cols[1] = status || '';
      cols[2] = cell(evidence || '');
      cols[3] = cell(skipReason || '');
      lines[i] = '| ' + cols.join(' | ') + ' |';
      break;
    }
  }
  return lines.join('\n');
}

// Append a row to `## Failure Routing Ledger` (after the separator / last row).
function appendLedgerRow(content, row) {
  const newRow = '| ' + [row.task, row.failing_command, row.classification, row.routed_to, row.evidence, row.status].map(cell).join(' | ') + ' |';
  const lines = content.split('\n');
  let secStart = -1, secEnd = lines.length;
  for (let i = 0; i < lines.length; i++) if (/^##\s+Failure Routing Ledger\s*$/.test(lines[i])) { secStart = i; break; }
  if (secStart === -1) return content;
  for (let i = secStart + 1; i < lines.length; i++) if (/^##\s+/.test(lines[i])) { secEnd = i; break; }
  // last table line in [secStart, secEnd)
  let lastTable = secStart;
  for (let i = secStart + 1; i < secEnd; i++) if (/^\|.+\|$/.test(lines[i].trim())) lastTable = i;
  lines.splice(lastTable + 1, 0, newRow);
  return lines.join('\n');
}

function ledgerHasRow(content, row) {
  // Compare against the SANITIZED forms, since stored cells are cell()-normalized.
  return tableRows(content, 'Failure Routing Ledger').some(c =>
    c[0] === cell(row.task) && c[1] === cell(row.failing_command || '') && c[2] === cell(row.classification || '') && c[3] === cell(row.routed_to || ''));
}

// ---------------------------------------------------------------------------
// subcommands
// ---------------------------------------------------------------------------
function progressTaskRows(content) {
  return tableRows(content, 'Tasks').map(c => ({ id: c[0], status: (c[2] || '').toLowerCase() }));
}

function runOrient(ctx) {
  const progress = readFileOr(ctx.progressPath, null);
  if (progress === null) {
    return { result: 'ok', project: ctx.project, initialized: false, next_command: '/' + KW + 'phase4 ' + ctx.project };
  }
  const rows = progressTaskRows(progress);
  const open = rows.find(r => r.status !== 'complete');
  const allComplete = rows.length > 0 && !open;
  return {
    result: 'ok',
    project: ctx.project,
    initialized: true,
    task_count: rows.length,
    first_open_task: open ? open.id : null,
    all_complete: allComplete,
    build_status: (setLineValue(progress, 'Build Status')) || 'clean',
    next_command: allComplete ? '/' + KW + 'phase5 ' + ctx.project : '/' + KW + 'phase4 ' + ctx.project,
  };
}
function setLineValue(content, heading) {
  const m = content.match(new RegExp('##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n([^\\n]*)'));
  return m ? m[1].trim() : null;
}

function runInitProgress(ctx, nowIso) {
  if (readFileOr(ctx.statePath, null) === null) return refuse('state_missing', { project: ctx.project });
  const plan = readFileOr(ctx.planPath, null);
  if (plan === null) return refuse('plan_missing', { project: ctx.project });
  const tasks = parsePlanTasks(plan);
  if (tasks.length === 0) return refuse('no_tasks', { project: ctx.project });
  if (fs.existsSync(ctx.progressPath)) {
    return { result: 'ok', project: ctx.project, task_count: tasks.length, created: false, idempotent: true };
  }
  const content = renderProgress(ctx.project, tasks, nowIso);
  const wrote = writeFileAtomic(ctx.progressPath, content);
  return { result: 'ok', project: ctx.project, task_count: tasks.length, created: wrote, idempotent: !wrote };
}

function runOpenTask(ctx, taskN) {
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  const progress = readFileOr(ctx.progressPath, null);
  if (progress === null) return refuse('progress_missing', { project: ctx.project });
  if (!progressTaskRows(progress).some(r => r.id === String(taskN))) return refuse('invalid_task', { project: ctx.project, detail: String(taskN) });
  const fields = {
    phase: '4', phase_name: 'Execute', step: 'delegate-task', task: String(taskN),
    next_command: '/' + KW + 'phase4 ' + ctx.project,
    inline_emergency_fallback_authorized: 'no',
  };
  const wrote = writeFileAtomic(ctx.statePath, applyStateFields(existing, fields));
  return { result: 'ok', project: ctx.project, task: taskN, step: 'delegate-task', state_written: wrote, idempotent: !wrote };
}

function runRecordFailure(ctx, taskN, packet, nowIso) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const progress = readFileOr(ctx.progressPath, null);
  if (progress === null) return refuse('progress_missing', { project: ctx.project });
  if (!progressTaskRows(progress).some(r => r.id === String(taskN))) return refuse('invalid_task', { project: ctx.project, detail: String(taskN) });
  const missing = ['failing_command', 'classification', 'routed_to'].filter(k => !packet[k] || !String(packet[k]).trim());
  if (missing.length) return refuse('missing_field', { project: ctx.project, detail: missing.join(', ') });
  const row = {
    task: taskN,
    failing_command: String(packet.failing_command).trim(),
    classification: String(packet.classification).trim(),
    routed_to: String(packet.routed_to).trim(),
    evidence: String(packet.evidence || '').trim(),
    status: String(packet.status || 'open').trim(),
  };
  if (ledgerHasRow(progress, row)) {
    return { result: 'ok', project: ctx.project, task: taskN, appended: false, idempotent: true };
  }
  let next = appendLedgerRow(progress, row);
  next = setSectionLine(next, 'Last Updated', nowIso);
  const wrote = writeProgressIdempotent(ctx.progressPath, next);
  return { result: 'ok', project: ctx.project, task: taskN, appended: wrote, idempotent: !wrote, routed_to: row.routed_to };
}

function runCloseTask(ctx, taskN, packet, nowIso) {
  if (!packet) return refuse('bad_packet', { project: ctx.project });
  const existing = readFileOr(ctx.statePath, null);
  if (existing === null) return refuse('state_missing', { project: ctx.project });
  const progress = readFileOr(ctx.progressPath, null);
  if (progress === null) return refuse('progress_missing', { project: ctx.project });
  const rows = progressTaskRows(progress);
  if (!rows.some(r => r.id === String(taskN))) return refuse('invalid_task', { project: ctx.project, detail: String(taskN) });

  const files = Array.isArray(packet.files_modified) ? packet.files_modified.join(', ') : String(packet.files_modified || '').trim();
  const buildStatus = String(packet.build_status || 'clean').trim() || 'clean';
  const evidence = String(packet.evidence || ('.cache/tdd-task-' + taskN + '.md')).trim();
  const complianceStatus = (packet.compliance_status && String(packet.compliance_status).trim()) || defaultActiveStatus(existing);

  // build the new progress content
  let next = setTaskRow(progress, taskN, 'complete', files);
  next = setComplianceRow(next, 'tdd-guide executor task ' + taskN, complianceStatus, evidence, '');
  next = setSectionLine(next, 'Build Status', buildStatus);
  next = setSectionLine(next, 'Last Updated', nowIso);

  // is this the LAST task (all complete after this close)?
  const afterRows = progressTaskRows(next);
  const open = afterRows.find(r => r.status !== 'complete');
  const allComplete = !open;

  // On the phase4->5 boundary, self-validate the WHOLE compliance table against the
  // real gate (with live state) — fail closed, zero mutation, like full-advance.js.
  if (allComplete) {
    const unresolved = repair.unresolvedCompliance(next, existing);
    if (unresolved.length) {
      return refuse('unresolved_compliance', { project: ctx.project, detail: unresolved.map(r => r.requirement).join(', ') });
    }
  }

  const pWrote = writeProgressIdempotent(ctx.progressPath, next);

  // advance the state pointer LAST
  let fields;
  if (allComplete) {
    fields = {
      phase: '4', phase_name: 'Execute', step: 'complete', task: String(taskN),
      next_command: '/' + KW + 'phase5 ' + ctx.project,
      next_skill: KW + 'review ' + ctx.project,
      inline_emergency_fallback_authorized: 'no',
    };
  } else {
    fields = {
      phase: '4', phase_name: 'Execute', step: 'execute', task: open.id,
      next_command: '/' + KW + 'phase4 ' + ctx.project,
      inline_emergency_fallback_authorized: 'no',
    };
  }
  const sWrote = writeFileAtomic(ctx.statePath, applyStateFields(existing, fields));
  return {
    result: 'ok',
    project: ctx.project,
    task: taskN,
    all_complete: allComplete,
    progress_written: pWrote,
    state_written: sWrote,
    idempotent: !pWrote && !sWrote,
    next_command: fields.next_command,
  };
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
  const taskIdx = args.indexOf('--task');
  const rootIdx = args.indexOf('--root');
  const nowIdx = args.indexOf('--now'); // test seam for deterministic timestamps

  function emit(result) {
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result && result.result === 'refuse') process.exitCode = 1;
  }

  if (!hasJson) { emit(refuse('invalid_args', { errors: ['--json is required'] })); return; }
  if (!subcommand || subcommand.startsWith('--')) { emit(refuse('invalid_args', { errors: ['subcommand is required'] })); return; }
  const known = ['orient', 'init-progress', 'open-task', 'record-failure', 'close-task'];
  if (!known.includes(subcommand)) { emit(refuse('unknown_subcommand', { detail: subcommand })); return; }

  const project = (projectIdx >= 0 && projectIdx + 1 < args.length) ? args[projectIdx + 1] : null;
  if (!project) { emit(refuse('invalid_args', { errors: ['--project is required'] })); return; }
  if (!validateProject(project)) { emit(refuse('invalid_project', { project })); return; }

  const root = (rootIdx >= 0 && rootIdx + 1 < args.length) ? args[rootIdx + 1] : process.cwd();
  const baseDir = path.join(root, 'kaola-workflow', project);
  const ctx = {
    project, cwd: root,
    statePath: path.join(baseDir, 'workflow-state.md'),
    planPath: path.join(baseDir, 'phase3-plan.md'),
    progressPath: path.join(baseDir, 'phase4-progress.md'),
  };

  const nowIso = (nowIdx >= 0 && nowIdx + 1 < args.length) ? args[nowIdx + 1] : new Date().toISOString();

  // --task parsing for task-scoped subcommands
  let taskN = null;
  if (['open-task', 'record-failure', 'close-task'].includes(subcommand)) {
    const raw = (taskIdx >= 0 && taskIdx + 1 < args.length) ? args[taskIdx + 1] : null;
    if (raw === null || !/^[0-9]+$/.test(raw)) { emit(refuse('invalid_task', { project, detail: raw == null ? '(missing)' : raw })); return; }
    taskN = raw;
  }

  let packet = null;
  if (hasStdin && (subcommand === 'record-failure' || subcommand === 'close-task')) {
    let raw = '';
    try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { raw = ''; }
    packet = safeJsonParse(raw);
  }

  let result;
  try {
    if (subcommand === 'orient') result = runOrient(ctx);
    else if (subcommand === 'init-progress') result = runInitProgress(ctx, nowIso);
    else if (subcommand === 'open-task') result = runOpenTask(ctx, taskN);
    else if (subcommand === 'record-failure') {
      if (!hasStdin) result = refuse('invalid_args', { project, errors: ['record-failure requires --stdin'] });
      else result = runRecordFailure(ctx, taskN, packet, nowIso);
    } else if (subcommand === 'close-task') {
      if (!hasStdin) result = refuse('invalid_args', { project, errors: ['close-task requires --stdin'] });
      else result = runCloseTask(ctx, taskN, packet, nowIso);
    }
  } catch (err) {
    result = refuse('invalid_args', { project, errors: ['internal error: ' + (err && err.message ? err.message : String(err))] });
  }
  emit(result);
}

if (require.main === module) main();

module.exports = {
  KW, POLICY_ACTIVE_STATUS, defaultActiveStatus,
  validateProject, stateField, safeJsonParse, applyStateFields,
  parsePlanTasks, renderProgress, setTaskRow, setComplianceRow, appendLedgerRow, ledgerHasRow, progressTaskRows,
  // #689: exported for the parent-dir-fsync-after-rename regression (the established
  // fs-singleton monkey-patch seam).
  writeFileAtomic,
};
