#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PHASES = {
  1: 'Research',
  2: 'Ideation',
  3: 'Plan',
  4: 'Execute',
  5: 'Review',
  6: 'Finalize'
};
const SKILLS = {
  1: 'kaola-workflow-research',
  2: 'kaola-workflow-ideation',
  3: 'kaola-workflow-plan',
  4: 'kaola-workflow-execute',
  5: 'kaola-workflow-review',
  6: 'kaola-workflow-finalize'
};
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
  const match = content.match(new RegExp('^' + escaped + ':\\s*(.+)$', 'm'));
  return match ? match[1].trim() : '';
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
  const phase = Number(field(content, 'phase'));
  const nextCommand = field(content, 'next_command');
  const nextSkill = field(content, 'next_skill');
  const phaseFile = field(content, 'phase_file');

  if (!PHASES[phase]) return false;
  const safeProject = project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const commandOk = new RegExp('^/kaola-workflow-phase' + phase + '\\s+' + safeProject + '$').test(nextCommand);
  const skillOk = new RegExp('^' + SKILLS[phase] + '\\s+' + safeProject + '$').test(nextSkill);
  if (!commandOk && !skillOk) return false;
  if (phaseFile && phaseFile !== 'N/A' && !exists(path.join(root, phaseFile))) return false;
  return /^status:\s*active\s*$/m.test(content);
}

function taskRows(content) {
  const start = content.search(/^## Tasks\s*$/m);
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
    .filter(columns => columns.length >= 3)
    .filter(columns => !/^[-\s]+$/.test(columns[0]))
    .filter(columns => !/^#$/i.test(columns[0]))
    .map(columns => ({ id: columns[0], status: columns[2].toLowerCase() }));
}

function allPhase4TasksComplete(content) {
  const tasks = taskRows(content);
  return tasks.length > 0 && tasks.every(task => task.status === 'complete');
}

function firstOpenPhase4Task(content) {
  const task = taskRows(content).find(row => row.status !== 'complete');
  return task ? task.id : 'N/A';
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
      skipReason: columns[3] || ''
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

function route(root, workflowDir, project, phase, phaseFile, task, crossesBoundary) {
  const stateFile = path.join(workflowDir, project, 'workflow-state.md');
  const state = exists(stateFile) ? readFile(stateFile) : '';
  const pendingGates = field(state, 'delegation_policy')
    ? unresolvedCompliance(readFile(phaseFile), state)
    : [];
  if (crossesBoundary !== false && pendingGates.length > 0) {
    return { reason: 'unresolved compliance gates in ' + path.basename(phaseFile) + ': ' + pendingGates.map(row => row.requirement).join(', ') };
  }
  return {
    root,
    project,
    phase,
    phaseName: PHASES[phase],
    step: 'router-reconstructed',
    task: task || 'N/A',
    nextCommand: '/kaola-workflow-phase' + phase + ' ' + project,
    nextSkill: SKILLS[phase] + ' ' + project,
    phaseFile,
    pendingGates
  };
}

function reconstruct(root, workflowDir, project) {
  const projectDir = path.join(workflowDir, project);
  const phase4 = artifact(projectDir, 'phase4-progress.md');
  if (artifact(projectDir, 'phase6-summary.md')) return { complete: true, reason: 'phase6-summary.md exists; workflow is complete' };
  if (artifact(projectDir, 'phase5-review.md')) return route(root, workflowDir, project, 6, artifact(projectDir, 'phase5-review.md'), undefined, true);
  if (phase4) {
    const content = readFile(phase4);
    return allPhase4TasksComplete(content)
      ? route(root, workflowDir, project, 5, phase4, undefined, true)
      : route(root, workflowDir, project, 4, phase4, firstOpenPhase4Task(content), false);
  }
  if (artifact(projectDir, 'phase3-plan.md')) return route(root, workflowDir, project, 4, artifact(projectDir, 'phase3-plan.md'), undefined, true);
  if (artifact(projectDir, 'phase2-ideation.md')) return route(root, workflowDir, project, 3, artifact(projectDir, 'phase2-ideation.md'), undefined, true);
  if (artifact(projectDir, 'phase1-research.md')) return route(root, workflowDir, project, 2, artifact(projectDir, 'phase1-research.md'), undefined, true);
  return { reason: 'no phase artifacts available for repair' };
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
  const preserved = ['GitLab', 'Sink']
    .map(section => extractSection(existingContent || '', section))
    .filter(Boolean);
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + routeResult.project,
    'status: active',
    '',
    '## Current Position',
    'phase: ' + routeResult.phase,
    'phase_name: ' + routeResult.phaseName,
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
    'fix_owner: ' + (routeResult.phase >= 4 ? 'tdd-guide or build-error-resolver' : 'N/A'),
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

function repair(projectArg, startDir) {
  const location = findWorkflowLocation(startDir || process.cwd());
  if (!location) return { repaired: false, reason: 'workflow directory not found' };
  const selected = selectProject(location.workflowDir, projectArg);
  if (!selected.project) return { repaired: false, reason: selected.reason };

  const stateFilePath = path.join(location.workflowDir, selected.project, 'workflow-state.md');
  let existingContent = '';
  try { existingContent = readFile(stateFilePath); } catch (_) {}

  if (existingContent && stateLooksValid(location.root, selected.project, existingContent)) {
    const routeResult = reconstruct(location.root, location.workflowDir, selected.project);

    if (routeResult.complete) {
      return { repaired: false, complete: true };
    }

    if (routeResult.project && routeResult.nextCommand &&
        routeResult.nextCommand !== field(existingContent, 'next_command')) {
      routeResult.root = location.root;
      fs.writeFileSync(stateFilePath, stateContent(routeResult, existingContent), 'utf8');
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
  fs.writeFileSync(stateFilePath, stateContent(result, existingContent), 'utf8');
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
  complianceRows,
  delegationPolicyCompliance,
  repair,
  reconstruct,
  stateLooksValid,
  stateContent,
  unresolvedCompliance
};
