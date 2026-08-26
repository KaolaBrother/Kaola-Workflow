#!/usr/bin/env node
// kaola-workflow-codex-compact-resume.js
// Codex-native compact/resume hook: reads durable workflow artifacts and emits
// a deterministic resume packet on stdout. Self-contained (only fs + path + stdin).
// AC-F: no Claude plugin-root env reference, no require() of edition code.
//
// The packet used to be derived from the frozen plan — the Node Ledger's in-progress row, its
// pending gate-verdict roles, the consent-halt marker and the task mirror. All four of those
// artifacts are gone. The run record is now mission-list.md, and the resume question it answers is
// the one the format states: done items are what is known, in-flight items with their dispatched
// locator are the decision to make, todo items are what remains.
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
const MISSION_LIST = 'mission-list.md';
// Long prose is truncated per item so the packet stays compact whatever the run's size. The
// locator matters more than the phrasing — a successor reads the file itself for the full text.
const ITEM_EXCERPT = 72;

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

function excerpt(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > ITEM_EXCERPT ? flat.slice(0, ITEM_EXCERPT - 1) + '…' : flat;
}

// The goal is the mission list's H1. Absent (or an empty file) reads as unknown rather than as an
// error: the file is a convention, not a precondition.
function parseGoal(missionListContent) {
  const match = missionListContent.match(/^#[ \t]+(.+?)[ \t]*$/m);
  return match ? match[1].trim() : 'unknown';
}

// Parse mission-list.md into items. An item opens on `- item:` and owns every following
// `key: value` line until the next item. Fields are optional and absent fields are simply absent,
// so an unrecognised key is skipped rather than treated as a malformation.
function parseItems(missionListContent) {
  const items = [];
  let current = null;
  for (const rawLine of String(missionListContent || '').split('\n')) {
    const opener = rawLine.match(/^[ \t]*-[ \t]+item:[ \t]*(.*)$/);
    if (opener) {
      current = { item: opener[1].trim(), status: 'todo', dispatched: '', result: '' };
      items.push(current);
      continue;
    }
    if (!current) continue;
    const kv = rawLine.match(/^[ \t]+([a-z_]+):[ \t]*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    if (key === 'status' || key === 'dispatched' || key === 'result') current[key] = kv[2].trim();
  }
  return items;
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

  // Read mission-list.md — the run record. Absent is a normal state (a claim with no list yet).
  const missionListPath = path.join(projDir, MISSION_LIST);
  let missionList = '';
  if (fs.existsSync(missionListPath)) {
    missionList = fs.readFileSync(missionListPath, 'utf8');
  }

  // Parse claim fields only — workflow-state.md identifies the project and its liveness posture;
  // the mission list, not persisted commands, is the recovery index.
  const projectName = field(stateContent, 'name');
  const claimStatus = field(stateContent, 'status');
  const branch = field(stateContent, 'branch');
  const worktree = field(stateContent, 'worktree_path');

  const goal = parseGoal(missionList);
  const items = parseItems(missionList);
  const counts = { done: 0, 'in-flight': 0, todo: 0 };
  const inFlight = [];
  for (const entry of items) {
    const status = counts[entry.status] === undefined ? 'todo' : entry.status;
    counts[status]++;
    // In-flight items are the decision a successor has to make, so they carry their dispatched
    // locator: "look for the work, not the worker" needs somewhere to look.
    if (status === 'in-flight') {
      inFlight.push(excerpt(entry.item) + (entry.dispatched ? ' [dispatched: ' + excerpt(entry.dispatched) + ']' : ''));
    }
  }

  // Build fixed-order deterministic packet (7 sections, no timestamps)
  // Section 1: active project
  // Section 2: claim/liveness fields
  // Section 3: the goal (the mission list's H1)
  // Section 4: in-flight items with their dispatched locators — the decision to make
  // Section 5: progress counts across the whole list
  const lines = [
    'Kaola-Workflow compact resume:',
    `active project: ${projectName}`,
    `claim status: ${claimStatus}`,
    `branch: ${branch}`,
    `worktree: ${worktree}`,
    `goal: ${goal}`,
    `in-flight: ${inFlight.length > 0 ? inFlight.join(' ; ') : 'none'}`,
    `mission counts: done: ${counts.done}, in-flight: ${counts['in-flight']}, todo: ${counts.todo}`
  ];

  // SessionStart/compact context injection: emit the resume packet as PLAIN stdout.
  // Per Claude Code hooks docs, any text a SessionStart hook writes to stdout is added
  // to context; the hookSpecificOutput.additionalContext envelope is optional and not
  // needed here. Codex CLI's hooks engine is schema-identical, so plain stdout injects identically.
  process.stdout.write(`${lines.join('\n')}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[kaola-workflow compact resume hook skipped] ${error.message}\n`);
}
