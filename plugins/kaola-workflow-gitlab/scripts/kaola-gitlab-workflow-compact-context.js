#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

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
const LEGACY_WORKFLOW_DIRS = ['claude-workflow'];

function findWorkflowLocation(startDir) {
  let current = path.resolve(startDir || process.cwd());

  while (true) {
    const workflowDirs = [];
    for (const name of [WORKFLOW_DIR, ...LEGACY_WORKFLOW_DIRS]) {
      const workflowDir = path.join(current, name);
      if (fs.existsSync(workflowDir)) {
        workflowDirs.push(workflowDir);
      }
    }
    if (workflowDirs.length > 0) {
      return { root: current, workflowDirs };
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function findStateFiles(workflowDir) {
  if (!fs.existsSync(workflowDir)) return [];

  return fs.readdirSync(workflowDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name !== 'archive')
    .map(entry => path.join(workflowDir, entry.name, 'workflow-state.md'))
    .filter(file => fs.existsSync(file))
    .map(file => ({
      file,
      mtimeMs: fs.statSync(file).mtimeMs,
      content: fs.readFileSync(file, 'utf8')
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^${escaped}:[ \\t]*(.+)$`, 'm'));
  return match ? match[1].trim() : 'unknown';
}

function hasActiveStatus(content) {
  return /^status:\s*active\s*$/m.test(content);
}

function main() {
  const input = parseJson(readStdin());
  const cwd = input.cwd || process.cwd();
  const location = findWorkflowLocation(cwd);
  if (!location) return;

  const { root, workflowDirs } = location;
  const states = workflowDirs.flatMap(findStateFiles)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (states.length === 0) return;

  const state = states.find(candidate => hasActiveStatus(candidate.content)) || states[0];
  const relativeState = path.relative(root, state.file);
  const content = state.content;
  const phase = field(content, 'phase');
  const step = field(content, 'step');
  const project = field(content, 'name');
  const nextCommand = field(content, 'next_command');
  const fallback = field(content, 'inline_emergency_fallback_authorized');

  const lines = [
    'Kaola-Workflow compact resume:',
    `- Read ${relativeState} first, then the current phase artifact or \`fast-summary.md\` and compliance ledger.`,
    `- Project: ${project}`,
    `- Current phase: ${phase}`,
    `- Current step: ${step}`,
    `- Next command: ${nextCommand}`,
    `- Inline emergency fallback authorized: ${fallback}`,
    '- If Phase 4 or Phase 6 validation failed, classify and route the failure; do not repair inline unless fallback is explicitly authorized.',
    '- If state and artifacts disagree, stop and reconstruct conservatively from phase files or `fast-summary.md`.'
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[kaola-workflow compact hook skipped] ${error.message}\n`);
}
