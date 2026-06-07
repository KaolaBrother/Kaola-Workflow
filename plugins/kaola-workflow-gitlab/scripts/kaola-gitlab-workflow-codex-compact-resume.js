#!/usr/bin/env node
// kaola-gitlab-workflow-codex-compact-resume.js
// Codex-native compact/resume hook: reads durable workflow artifacts and emits
// a deterministic resume packet on stdout. Self-contained (only fs + path + stdin).
// AC-F: no Claude plugin-root env reference, no require() of edition code.
const fs = require('fs');
const path = require('path');

// Gate-verdict roles per plan-validator GATE_VERDICT_ROLES.
const GATE_VERDICT_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier']);

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseJson(input) {
  if (!input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

const WORKFLOW_DIR = 'kaola-workflow';

function findWorkflowLocation(startDir) {
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    const candidate = path.join(current, WORKFLOW_DIR);
    if (fs.existsSync(candidate)) {
      return { root: current, workflowDir: candidate };
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// Find the active project directory under kaola-workflow/
function findActiveProject(workflowDir) {
  if (!fs.existsSync(workflowDir)) return null;
  const entries = fs.readdirSync(workflowDir, { withFileTypes: true });
  const projects = entries
    .filter(e => e.isDirectory() && e.name !== 'archive' && !e.name.startsWith('.'))
    .map(e => {
      const stateFile = path.join(workflowDir, e.name, 'workflow-state.md');
      if (!fs.existsSync(stateFile)) return null;
      const content = fs.readFileSync(stateFile, 'utf8');
      return { name: e.name, stateFile, content, mtimeMs: fs.statSync(stateFile).mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Prefer active status; fall back to most-recently-modified
  const active = projects.find(p => /^status:\s*active\s*$/m.test(p.content));
  return active || projects[0] || null;
}

// Extract a single named field from content (key: value)
function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : 'unknown';
}

// Split a document into named sections keyed by ## heading title.
function parseSections(content) {
  const sections = {};
  const sectionRegex = /^##\s+(.*?)\s*$\n((?:(?!^##\s)[\s\S])*)/gm;
  let m;
  while ((m = sectionRegex.exec(content)) !== null) {
    sections[m[1]] = m[2];
  }
  return sections;
}

// Parse table rows from a markdown table string.
// Returns array of column arrays (skipping header and separator rows).
function parseTableRows(tableText) {
  const rows = [];
  for (const line of tableText.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    // Skip header row and separator rows (dashes)
    if (cols[0] === 'id' || /^-+$/.test(cols[0])) continue;
    rows.push(cols);
  }
  return rows;
}

// Build a map of node id -> role from the Nodes table.
function buildNodeRoleMap(planContent) {
  const sections = parseSections(planContent);
  const nodesText = sections['Nodes'];
  if (!nodesText) return {};
  const map = {};
  for (const cols of parseTableRows(nodesText)) {
    const id = cols[0];
    const role = cols[1];
    if (id && role) map[id] = role;
  }
  return map;
}

// Parse the Node Ledger table from workflow-plan.md.
// Returns { inProgress: string|null, pendingGates: string[], consentHalt: boolean }
// pendingGates = pending nodes whose role is in GATE_VERDICT_ROLES.
// consentHalt = true when 'consent_halt: pending' appears anywhere in planContent.
// Scans the full planContent (not just ledgerText) because adaptive-node.js fallback
// paths can append the marker after the Node Ledger section boundary.
function parseLedger(planContent) {
  const sections = parseSections(planContent);
  const ledgerText = sections['Node Ledger'];
  if (!ledgerText) return { inProgress: null, pendingGates: [], consentHalt: false };

  const nodeRoleMap = buildNodeRoleMap(planContent);
  const inProgress = [];
  const pendingGates = [];
  // Scan full planContent — fallback write paths may place marker after Node Ledger section
  const consentHalt = /consent_halt:\s*pending/.test(planContent);

  for (const cols of parseTableRows(ledgerText)) {
    const id = cols[0];
    const status = cols[1] ? cols[1].toLowerCase() : '';
    if (status === 'in_progress') inProgress.push(id);
    else if (status === 'pending') {
      const role = nodeRoleMap[id];
      if (role && GATE_VERDICT_ROLES.has(role)) pendingGates.push(id);
    }
  }

  return {
    inProgress: inProgress.length > 0 ? inProgress[0] : null,
    pendingGates,
    consentHalt
  };
}

// Summarize workflow-tasks.json: counts by status + the in-progress task id
function summarizeTasks(tasksPath) {
  if (!fs.existsSync(tasksPath)) return 'task mirror: not generated';
  let data;
  try {
    data = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  } catch {
    return 'task mirror: not generated';
  }
  if (!data || !Array.isArray(data.tasks)) return 'task mirror: not generated';

  const counts = { completed: 0, in_progress: 0, pending: 0 };
  let inProgressId = null;

  for (const task of data.tasks) {
    const s = task.status || 'pending';
    if (s === 'completed') counts.completed++;
    else if (s === 'in_progress') { counts.in_progress++; inProgressId = task.id; }
    else counts.pending++;
  }

  const parts = [
    `completed: ${counts.completed}`,
    `in_progress: ${counts.in_progress}`,
    `pending: ${counts.pending}`
  ];
  if (inProgressId) parts.push(`in_progress_task: ${inProgressId}`);
  return `task mirror: ${parts.join(', ')}`;
}

function main() {
  const input = parseJson(readStdin());
  const cwd = input.cwd || process.cwd();
  const location = findWorkflowLocation(cwd);
  if (!location) return;

  const { workflowDir } = location;
  const project = findActiveProject(workflowDir);
  if (!project) return;

  const projDir = path.join(workflowDir, project.name);
  const stateContent = project.content;

  // Read workflow-plan.md
  const planPath = path.join(projDir, 'workflow-plan.md');
  let planContent = '';
  if (fs.existsSync(planPath)) {
    planContent = fs.readFileSync(planPath, 'utf8');
  }

  // Parse state fields
  const projectName = field(stateContent, 'name');
  const nextCommand = field(stateContent, 'next_command');
  const nextSkill = field(stateContent, 'next_skill');
  // escalated_to_full is written into workflow-state.md on write-halt
  const escalated = field(stateContent, 'escalated_to_full');
  const inlineFallback = field(stateContent, 'inline_emergency_fallback_authorized');

  // Parse ledger: in-progress node, pending gate nodes, consent_halt marker
  const nodeRoleMap = buildNodeRoleMap(planContent);
  const { inProgress, pendingGates, consentHalt } = parseLedger(planContent);
  const inProgressRole = inProgress ? (nodeRoleMap[inProgress] || null) : null;

  // Task mirror summary
  const tasksPath = path.join(projDir, 'workflow-tasks.json');
  const taskSummary = summarizeTasks(tasksPath);

  // Build fixed-order deterministic packet (6 sections, no timestamps)
  // Section 1: active project
  // Section 2: next skill/command
  // Section 3: in-progress node
  // Section 4: pending gates (gate-verdict roles only: code-reviewer, security-reviewer, adversarial-verifier)
  // Section 5: consent-halt markers
  // Section 6: task-mirror summary
  const lines = [
    'Kaola-Workflow compact resume:',
    `active project: ${projectName}`,
    `next skill/command: ${nextSkill !== 'unknown' ? nextSkill : nextCommand}`,
    `in-progress node: ${inProgress || 'none'}${inProgressRole ? ` (role: ${inProgressRole})` : ''}`,
    `pending gates: ${pendingGates.length > 0 ? pendingGates.join(', ') : 'none'}`,
    `consent-halt markers: consent_halt=${consentHalt ? 'pending' : 'none'} escalated_to_full=${escalated} inline_emergency_fallback_authorized=${inlineFallback}`,
    taskSummary
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[kaola-workflow compact resume hook skipped] ${error.message}\n`);
}
