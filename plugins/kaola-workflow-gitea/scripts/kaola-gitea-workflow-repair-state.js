#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// issue #227: adaptive resume traverses a frozen workflow-plan.md. Toggle-agnostic —
// never reads the adaptive install switch or its env mirror (selection-only gate).
const planValidator = require('./kaola-gitea-workflow-plan-validator');
const adaptiveSchema = require('./kaola-workflow-adaptive-schema'); // #234: durable consent-halt reader (un-renamed; toggle-agnostic)

const DELEGATION_POLICIES = new Set(['delegate', 'local-authorized', 'tool-unavailable']);
const DELEGATION_STATUSES = new Set([
  'subagent-invoked',
  'local-fallback-explicit',
  'local-fallback-tool-unavailable'
]);
const INACTIVE_STATUSES = new Set(['n/a', 'na', 'skipped']);
const DELEGATION_CONTROLLED_REQUIREMENTS = [
  /^(code-explorer|planner|code-architect|doc-updater)$/i,
  /^tdd-guide\b/i,
  /executor/i,
  /^quality review$/i,
  /^security review$/i,
  /^review-fix executors$/i,
  /^code-reviewer$/i,
  /^security-reviewer$/i
];

function exists(file) {
  return fs.existsSync(file);
}

function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

// issue #227: adaptive-path state keyed on `workflow_path: adaptive`. Toggle-agnostic.
function isAdaptiveWorkflowState(content) {
  return field(content, 'workflow_path') === 'adaptive';
}

function adaptiveStateValid(project, content) {
  if (!/^status:\s*active\s*$/m.test(content)) return false;
  const safeProject = project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^/kaola-workflow-plan-run\\s+' + safeProject + '$').test(field(content, 'next_command')) ||
    new RegExp('^kaola-workflow-plan-run\\s+' + safeProject + '$').test(field(content, 'next_skill'));
}

function isSafeName(name) {
  return Boolean(name) && !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..';
}

function projectHasPhaseArtifacts(projectDir) {
  if (!exists(projectDir)) return false;
  return fs.readdirSync(projectDir).some(file => /^phase\d.+\.md$/.test(file));
}

function findWorkflowLocation(startDir) {
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    const workflowDir = path.join(current, 'kaola-workflow');
    if (exists(workflowDir)) return { root: current, workflowDir };
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function activeProjects(workflowDir) {
  if (!exists(workflowDir)) return [];
  return fs.readdirSync(workflowDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name !== 'archive' && !entry.name.startsWith('.'))
    .filter(entry => {
      const projectDir = path.join(workflowDir, entry.name);
      const stateFile = path.join(projectDir, 'workflow-state.md');
      if (projectHasPhaseArtifacts(projectDir)) return true;
      // issue #227: an adaptive project's spine is workflow-plan.md (no numbered artifacts).
      if (exists(path.join(projectDir, 'workflow-plan.md'))) return true;
      if (!exists(stateFile)) return false;
      const content = readFile(stateFile);
      return /^status:\s*active\s*$/m.test(content);
    })
    .map(entry => entry.name)
    .sort();
}

function selectProject(workflowDir, argument) {
  const requested = String(argument || '').trim().split(/\s+/)[0];
  if (isSafeName(requested) && exists(path.join(workflowDir, requested))) return { project: requested };
  const projects = activeProjects(workflowDir);
  if (projects.length === 1) return { project: projects[0] };
  if (projects.length > 1) return { reason: 'ambiguous active projects: ' + projects.join(', ') };
  return { reason: 'no active workflow projects' };
}

function stateLooksValid(root, project, content) {
  return isAdaptiveWorkflowState(content) && adaptiveStateValid(project, content);
}

function complianceRows(content) {
  const start = content.search(/^## Required Agent Compliance\s*$/m);
  if (start === -1) return [];
  const rest = content.slice(start).split(/\r?\n/).slice(1);
  const section = [];
  for (const line of rest) {
    if (/^##\s+/.test(line)) break;
    section.push(line);
  }
  return section
    .filter(line => /^\|.+\|$/.test(line.trim()))
    .map(line => line.trim().split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(columns => columns.length >= 2)
    .filter(columns => !/^[-\s]+$/.test(columns[0]))
    .filter(columns => !/^requirement$/i.test(columns[0]))
    .map(columns => ({
      requirement: columns[0],
      status: columns[1] || '',
      evidence: columns[2] || '',
      binding: columns.length >= 5 ? (columns[3] || '') : '',
      skipReason: columns.length >= 5 ? (columns[4] || '') : (columns[3] || '')
    }));
}

function isDelegationControlledRequirement(requirement) {
  return DELEGATION_CONTROLLED_REQUIREMENTS.some(pattern => pattern.test(requirement || ''));
}

function hasEvidenceOrSkip(row) {
  return Boolean((row.evidence || '').trim() || (row.skipReason || '').trim());
}

function delegationPolicyCompliance(phaseContent, stateContent) {
  const policy = field(stateContent || '', 'delegation_policy');
  if (!policy) return { ok: true, reason: 'delegation_policy absent' };
  if (!DELEGATION_POLICIES.has(policy)) {
    return { ok: false, reason: 'unknown delegation_policy: ' + policy };
  }

  const controlledRows = complianceRows(phaseContent)
    .filter(row => isDelegationControlledRequirement(row.requirement));
  if (controlledRows.length === 0) return { ok: true, reason: 'no delegation-controlled rows' };

  const activeRows = [];
  for (const row of controlledRows) {
    const status = row.status.toLowerCase();
    if (INACTIVE_STATUSES.has(status)) {
      if (!hasEvidenceOrSkip(row)) {
        return { ok: false, reason: row.requirement + ' is ' + row.status + ' without evidence or skip reason' };
      }
      continue;
    }
    const requirement = row.requirement.trim().toLowerCase();
    if ((requirement === 'code-reviewer' || requirement === 'security-reviewer')
        && (status === 'invoked' || status === 'subagent-invoked')
        && Boolean((row.evidence || '').trim())) {
      // Full-path reviewers may never fall back locally. Their mandatory named
      // invocation is stronger than the workflow-wide fallback posture, so a
      // truthful invocation remains compliant under every delegation policy.
      continue;
    }
    if (!DELEGATION_STATUSES.has(status)) {
      return { ok: false, reason: row.requirement + ' uses ' + (row.status || 'missing') + ' instead of delegation vocabulary' };
    }
    activeRows.push(Object.assign({}, row, { status }));
  }

  if (activeRows.length === 0) return { ok: true, reason: 'all delegation-controlled rows are inactive with evidence' };

  if (policy === 'delegate') {
    if (activeRows.some(row => row.status === 'local-fallback-explicit')) {
      return { ok: false, reason: 'delegate policy does not allow local-fallback-explicit rows' };
    }
    if (activeRows.some(row => row.status === 'subagent-invoked')) {
      if (activeRows.every(row =>
        row.status === 'subagent-invoked' ||
        (row.status === 'local-fallback-tool-unavailable' && hasEvidenceOrSkip(row))
      )) {
        return { ok: true, reason: 'delegate policy has subagent-invoked evidence' };
      }
      return { ok: false, reason: 'delegate policy allows only subagent-invoked or evidenced local-fallback-tool-unavailable rows' };
    }
    if (activeRows.every(row =>
      row.status === 'local-fallback-tool-unavailable' && hasEvidenceOrSkip(row)
    )) {
      return { ok: true, reason: 'delegate policy has only tool-unavailable fallbacks with evidence' };
    }
    return { ok: false, reason: 'delegate policy requires subagent-invoked or only evidenced local-fallback-tool-unavailable rows' };
  }

  if (policy === 'local-authorized') {
    if (activeRows.every(row => row.status === 'local-fallback-explicit')) {
      return { ok: true, reason: 'local-authorized policy has explicit local fallback rows' };
    }
    return { ok: false, reason: 'local-authorized policy requires local-fallback-explicit rows' };
  }

  if (activeRows.every(row =>
    row.status === 'local-fallback-tool-unavailable' && hasEvidenceOrSkip(row)
  )) {
    return { ok: true, reason: 'tool-unavailable policy has evidenced tool-unavailable rows' };
  }
  return { ok: false, reason: 'tool-unavailable policy requires local-fallback-tool-unavailable rows with evidence' };
}

function unresolvedCompliance(content, stateContent) {
  const rows = complianceRows(content);
  if (rows.length === 0) {
    return [{ requirement: 'Required Agent Compliance table', status: 'missing', evidence: '', skipReason: '' }];
  }
  const unresolved = rows.filter(row => {
    // #372 (resume compat): the legacy advisor-gate rows are retired. A pre-#372 phase file may carry
    // such a compliance row (its requirement contains both "advisor" and "gate"); map it forward as
    // satisfied so an old in-flight project resumes without bricking — never pending-blocking.
    const requirement = (row.requirement || '').toLowerCase();
    if (requirement.includes('advisor') && requirement.includes('gate')) return false;
    const status = row.status.toLowerCase();
    if (!status || ['pending', 'missing', 'todo', 'unknown'].includes(status)) return true;
    if (status === 'invoked' && !row.evidence) return true;
    if (INACTIVE_STATUSES.has(status) && !row.evidence && !row.skipReason) return true;
    return false;
  });
  const policyCheck = delegationPolicyCompliance(content, stateContent || '');
  if (!policyCheck.ok) {
    unresolved.push({
      requirement: 'delegation_policy cross-check',
      status: field(stateContent || '', 'delegation_policy') || 'missing',
      evidence: 'workflow-state.md',
      skipReason: policyCheck.reason
    });
  }
  return unresolved;
}

function artifact(projectDir, file) {
  const fullPath = path.join(projectDir, file);
  return exists(fullPath) ? fullPath : null;
}

// issue #227: adaptive reconstruction — traverse the frozen workflow-plan.md (NOT the
// phaseN ladder). Re-check plan_hash integrity; a tampered/unparseable plan is a typed
// refusal (never a phaseN fallback, #44); a consent-halt is surfaced. Toggle-agnostic.
function routeAdaptive(root, workflowDir, project) {
  const projectDir = path.join(workflowDir, project);
  const planFile = path.join(projectDir, 'workflow-plan.md');
  const content = readFile(planFile);
  // Resume requires a frozen plan. revalidateForResume() fails closed on a MISSING
  // plan_hash ('plan_hash missing — plan is not frozen'), so it must run UNCONDITIONALLY:
  // an earlier `if (stored)` guard let an attacker delete the <!-- plan_hash --> comment,
  // append an ungated node, and fall through to a valid resume route (a B3 cousin). The
  // unparseable-Nodes check stays FIRST only for a clearer diagnostic; it is not the gate.
  if (planValidator.parseNodes(content).length === 0) {
    return { reason: 'adaptive plan unparseable (typed refusal): workflow-plan.md has no ## Nodes table' };
  }
  const check = planValidator.revalidateForResume(content, { root });
  if (!check.ok) return { reason: 'adaptive plan unresumable (typed refusal): ' + check.reason };
  const stateFile = path.join(projectDir, 'workflow-state.md');
  const stateContent = exists(stateFile) ? readFile(stateFile) : '';
  // #234 E2: consent-halt durable in BOTH workflow-state.md AND the plan's non-hashed ## Node Ledger.
  const consentHalt = field(stateContent, 'escalated_to_full') === 'consent'
    || adaptiveSchema.readDurableConsentHalt(content);
  // #231: compute gate-execution status from the ledger, surfaced NON-blocking (data only); the
  // hard block is the phase6 merge gate. verifyGateExecution never reads the install switch.
  const gate = planValidator.verifyGateExecution(content, { root });
  const pendingGates = gate.ok ? [] : gate.unsatisfied.map(u => ({
    requirement: u.requirement, status: 'unsatisfied', evidence: '', skipReason: u.reason
  }));
  // #258: surface missing/failing verdict evidence for COMPLETE gate-role nodes, NON-blocking.
  const cacheDir = path.join(projectDir, '.cache');
  const readCache = fileName => { try { return fs.readFileSync(path.join(cacheDir, fileName), 'utf8'); } catch (_) { return null; } };
  const globCache = prefix => { try { return fs.readdirSync(cacheDir).filter(f => f.startsWith(prefix) && f.endsWith('.md')); } catch (_) { return []; } };
  const verdict = planValidator.verifyVerdictBlock(content, { readCache, globCache });
  if (!verdict.ok) { for (const f of verdict.failures) { pendingGates.push({
    requirement: (check.contract_version === 2 ? 'review receipt ' : 'verdict gate ') + f.nodeId + ' (' + f.role + ')',
    status: check.contract_version === 2 ? 'missing-or-stale-review-receipt' : 'missing-verdict',
    evidence: '', skipReason: f.reason
  }); } }
  return {
    root, project, phase: 'adaptive', phaseName: 'Adaptive', workflowPath: 'adaptive',
    step: consentHalt ? 'consent-halt-surface' : 'router-reconstructed', task: 'N/A', consentHalt,
    nextCommand: '/kaola-workflow-plan-run ' + project,
    nextSkill: 'kaola-workflow-plan-run ' + project,
    phaseFile: planFile,
    planSchemaVersion: check.plan_schema_version,
    reviewContractVersion: check.contract_version,
    pendingGates
  };
}

function reconstruct(root, workflowDir, project) {
  const projectDir = path.join(workflowDir, project);
  if (artifact(projectDir, 'finalization-summary.md')) return { complete: true, reason: 'finalization-summary.md exists; workflow is complete' };
  // issue #227: the adaptive plan is the only reconstruction spine (the phaseN ladder is retired).
  if (artifact(projectDir, 'workflow-plan.md')) return routeAdaptive(root, workflowDir, project);
  return { reason: 'no adaptive plan available for repair' };
}

function extractSection(content, heading) {
  if (!content) return '';
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('(?:^|\\n)(## ' + escaped + '[\\s\\S]*?)(?=\\n## |\\s*$)'));
  return match ? match[1].trim() : '';
}

function stateContent(routeResult, existingContent) {
  const relativePhaseFile = path.relative(routeResult.root, routeResult.phaseFile);
  const delegationPolicy = field(existingContent || '', 'delegation_policy');
  const preserved = ['Gitea', 'Sink']
    .map(section => extractSection(existingContent || '', section))
    .filter(Boolean);
  const positionLines = routeResult.isFinalization
    ? [
        'stage: ' + routeResult.stage,
        'stage_name: ' + routeResult.stageName,
      ]
    : [
        'phase: ' + routeResult.phase,
        'phase_name: ' + routeResult.phaseName,
      ];
  const fixOwner = routeResult.phase >= 4 || routeResult.isFinalization
    ? 'tdd-guide or build-error-resolver'
    : 'N/A';
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + routeResult.project,
    'status: active',
    '',
    '## Current Position',
    ...positionLines,
    ...(routeResult.workflowPath ? ['workflow_path: ' + routeResult.workflowPath] : []),
    'step: ' + routeResult.step,
    'task: ' + routeResult.task,
    'next_command: ' + routeResult.nextCommand,
    'next_skill: ' + routeResult.nextSkill,
    ...(delegationPolicy ? ['delegation_policy: ' + delegationPolicy] : []),
    '',
    '## Pending Gates',
    ...(
      routeResult.pendingGates && routeResult.pendingGates.length > 0
        ? routeResult.pendingGates.map(row => '- ' + row.requirement + ': ' + (row.status || 'missing'))
        : ['- none']
    ),
    '',
    '## Ownership Rules',
    'main_session_role: orchestrator',
    'implementation_owner: ' + (routeResult.phase === 4 ? 'tdd-guide' : 'N/A'),
    'fix_owner: ' + fixOwner,
    'inline_emergency_fallback_authorized: no',
    '',
    '## Last Evidence',
    'phase_file: ' + relativePhaseFile,
    'cache_file: N/A',
    'last_command: repair-state',
    'last_result: state_repaired_from_artifacts',
    '',
    '## Last Updated',
    new Date().toISOString()
  ];
  return lines.concat('', preserved).join('\n') + '\n';
}

// issue #283: one-way in-flight migration — converts legacy active folders from
// phase6-summary.md → finalization-summary.md and rewrites stale state fields.
// Non-destructive to archive/ (never runs on archived projects).
function migrateActiveLegacyFolder(workflowDir, project) {
  const projectDir = path.join(workflowDir, project);
  if (!exists(projectDir)) return;
  const legacySummary = path.join(projectDir, 'phase6-summary.md');
  const newSummary = path.join(projectDir, 'finalization-summary.md');
  if (exists(legacySummary) && !exists(newSummary)) {
    fs.renameSync(legacySummary, newSummary);
  }
  const stateFile = path.join(projectDir, 'workflow-state.md');
  if (!exists(stateFile)) return;
  let content = readFile(stateFile);
  let changed = false;
  if (/^phase:\s*6\s*$/m.test(content)) { content = content.replace(/^phase:\s*6\s*$/m, 'stage: finalization'); changed = true; }
  if (/^phase_name:\s*Finalize\s*$/m.test(content)) { content = content.replace(/^phase_name:\s*Finalize\s*$/m, 'stage_name: Finalization'); changed = true; }
  if (/^next_command:\s*\/kaola-workflow-phase6\s+/m.test(content)) {
    content = content.replace(/^(next_command:\s*)\/kaola-workflow-phase6(\s+)/m, '$1/kaola-workflow-finalize$2');
    changed = true;
  }
  if (changed) { adaptiveSchema.writeFileAtomicReplace(stateFile, content); }
}

function repair(projectArg, startDir) {
  const location = findWorkflowLocation(startDir || process.cwd());
  if (!location) return { repaired: false, reason: 'workflow directory not found' };
  const selected = selectProject(location.workflowDir, projectArg);
  if (!selected.project) return { repaired: false, reason: selected.reason };
  migrateActiveLegacyFolder(location.workflowDir, selected.project);

  const stateFilePath = path.join(location.workflowDir, selected.project, 'workflow-state.md');
  let existingContent = '';
  try { existingContent = readFile(stateFilePath); } catch (_) {}

  if (existingContent && stateLooksValid(location.root, selected.project, existingContent)) {
    const routeResult = reconstruct(location.root, location.workflowDir, selected.project);

    if (routeResult.complete) {
      return { repaired: false, complete: true };
    }

    if (!routeResult.nextCommand) {
      return Object.assign({ repaired: false, project: selected.project }, routeResult);
    }

    if (routeResult.project && routeResult.nextCommand &&
        routeResult.nextCommand !== field(existingContent, 'next_command')) {
      routeResult.root = location.root;
      adaptiveSchema.writeFileAtomicReplace(stateFilePath, stateContent(routeResult, existingContent));
      return { repaired: true, stale: true, project: selected.project, phase: routeResult.phase, next_skill: routeResult.nextSkill };
    }

    return {
      repaired: false,
      valid: true,
      project: selected.project,
      phase: Number(field(existingContent, 'phase')),
      next_skill: field(existingContent, 'next_skill')
    };
  }

  const result = reconstruct(location.root, location.workflowDir, selected.project);
  if (!result.project) return Object.assign({ repaired: false, project: selected.project }, result);
  result.root = location.root;
  adaptiveSchema.writeFileAtomicReplace(stateFilePath, stateContent(result, existingContent));
  return { repaired: true, project: selected.project, phase: result.phase, next_skill: result.nextSkill };
}

function main() {
  const result = repair(process.argv[2], process.cwd());
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.repaired && !result.complete && !result.valid) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  repairStateContent: stateContent,
  complianceRows,
  delegationPolicyCompliance,
  repair,
  reconstruct,
  stateLooksValid,
  stateContent,
  unresolvedCompliance,
  isAdaptiveWorkflowState,
  adaptiveStateValid,
  routeAdaptive
};
