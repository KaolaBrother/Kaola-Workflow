#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const AGENTS_MARKER = 'KW-AGENTS-MANAGED';
const CLAUDE_MARKER = 'KW-CLAUDE-OVERLAY-MANAGED';
const LEGACY_REDIRECT = [
  '# AGENTS.md',
  '',
  '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**',
  '>',
  '> `CLAUDE.md` in this repository root is the **single canonical source** for all',
  '> non-negotiable rules, project conventions, workflow constraints, and agent',
  '> behavior. AGENTS.md exists **only** to direct you there.',
  '>',
  '> **Required at session start, before any tool call, edit, or response:**',
  '>',
  '> 1. Read `CLAUDE.md` in full.',
  '> 2. Treat its `## Non-Negotiable Rules` section as binding for every action you take in this repo.',
  '> 3. If `CLAUDE.md` is missing, **stop and ask the user** — do not proceed on assumptions.',
  '>',
  '> Do not skip this step because the task looks small. Do not rely on prior',
  '> session memory. Re-read on every new session.',
  '',
  '---',
  '',
  '*All other guidance — the workflow, scripts, conventions, gotchas — lives in `CLAUDE.md`. This file intentionally contains nothing else.*',
  '',
].join('\n');

function sha256(bytes) {
  if (bytes == null) return null;
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readOptional(file) {
  try { return fs.readFileSync(file); } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function managedRegion(text, marker) {
  const startToken = '<!-- ' + marker + '-START -->';
  const endToken = '<!-- ' + marker + '-END -->';
  const starts = [...text.matchAll(new RegExp(startToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))];
  const ends = [...text.matchAll(new RegExp(endToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))];
  if (starts.length === 0 && ends.length === 0) return { kind: 'absent' };
  if (starts.length !== 1 || ends.length !== 1 || starts[0].index >= ends[0].index) {
    return { kind: 'malformed' };
  }
  const start = starts[0].index;
  const end = ends[0].index + endToken.length;
  return { kind: 'managed', start, end, prefix: text.slice(0, start), suffix: text.slice(end) };
}

function hasActiveRun(projectRoot) {
  const runRoot = path.join(projectRoot, 'kaola-workflow');
  if (!fs.existsSync(runRoot)) return false;
  for (const entry of fs.readdirSync(runRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const statePath = path.join(runRoot, entry.name, 'workflow-state.md');
    const bytes = readOptional(statePath);
    if (bytes && /^status:\s*active\s*$/mi.test(bytes.toString('utf8'))) return true;
  }
  return false;
}

function sourceTemplates() {
  const root = path.resolve(__dirname, '..');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  if (managedRegion(agents, AGENTS_MARKER).kind !== 'managed'
      || managedRegion(claude, CLAUDE_MARKER).kind !== 'managed') {
    throw new Error('source instruction templates are missing managed markers');
  }
  return { agents, claude };
}

function mergeManaged(existingBytes, template, marker, legacy) {
  const existing = existingBytes == null ? '' : existingBytes.toString('utf8');
  const templateRegion = managedRegion(template, marker);
  const replacement = template.slice(templateRegion.start, templateRegion.end);
  const region = managedRegion(existing, marker);
  if (region.kind === 'malformed') return { classification: 'ambiguous_managed_region' };
  if (region.kind === 'managed') {
    const after = region.prefix + replacement + region.suffix;
    return {
      classification: 'managed_region',
      after,
      outsideBytesPreserved: true,
      changed: after !== existing,
    };
  }
  if (legacy && existing.startsWith(legacy)) {
    return {
      classification: existing === legacy ? 'known_legacy_redirect' : 'known_legacy_plus_owner_bytes',
      after: template + existing.slice(legacy.length),
      outsideBytesPreserved: true,
      changed: true,
    };
  }
  if (existingBytes == null || existing.length === 0) {
    return {
      classification: 'missing',
      after: template,
      outsideBytesPreserved: true,
      changed: true,
    };
  }
  return { classification: 'owner_only' };
}

function mergeClaude(existingBytes, template, allowOwnerOverlay) {
  const existing = existingBytes == null ? '' : existingBytes.toString('utf8');
  const normal = mergeManaged(existingBytes, template, CLAUDE_MARKER, null);
  if (normal.after != null || normal.classification === 'ambiguous_managed_region') return normal;
  if (allowOwnerOverlay) {
    return {
      classification: 'owner_overlay_preserved',
      after: template + existing,
      outsideBytesPreserved: true,
      changed: true,
    };
  }
  return normal;
}

function classifyProjectInstructions({ agentsBytes, claudeBytes, activeWorkflowStates = false }) {
  if (activeWorkflowStates) {
    return {
      status: 'active_run_preserved',
      changed: false,
      agents: { classification: 'active_run_preserved' },
      claude: { classification: 'active_run_preserved' },
    };
  }
  const templates = sourceTemplates();
  const agents = mergeManaged(agentsBytes, templates.agents, AGENTS_MARKER, LEGACY_REDIRECT);
  const agentsSafe = agents.after != null;
  const claude = mergeClaude(claudeBytes, templates.claude, agentsSafe);
  if (!agentsSafe || claude.after == null) {
    return { status: 'decision_required', changed: false, agents, claude };
  }
  return {
    status: agents.changed || claude.changed ? 'planned' : 'converged',
    changed: !!(agents.changed || claude.changed),
    agents,
    claude,
  };
}

function fileEnvelope(classification, beforeBytes, afterText) {
  const afterBytes = afterText == null ? beforeBytes : Buffer.from(afterText);
  return {
    classification: classification.classification,
    before_sha256: sha256(beforeBytes),
    after_sha256: sha256(afterBytes),
    outside_bytes_preserved: classification.outsideBytesPreserved === true,
  };
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.kw-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function execute(mode, projectRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const claudePath = path.join(projectRoot, 'CLAUDE.md');
  const agentsBytes = readOptional(agentsPath);
  const claudeBytes = readOptional(claudePath);
  const classification = classifyProjectInstructions({
    agentsBytes,
    claudeBytes,
    activeWorkflowStates: hasActiveRun(projectRoot),
  });
  let status = classification.status;
  const writes = [];
  if (status === 'planned' && mode === 'check') status = 'drift';
  if (classification.status === 'planned' && mode === 'apply') {
    if (classification.agents.changed) {
      atomicWrite(agentsPath, classification.agents.after);
      writes.push('AGENTS.md');
    }
    if (classification.claude.changed) {
      atomicWrite(claudePath, classification.claude.after);
      writes.push('CLAUDE.md');
    }
    status = 'applied';
  }
  const envelope = {
    schema_version: SCHEMA_VERSION,
    mode,
    status,
    changed: status === 'applied',
    files: {
      agents: fileEnvelope(classification.agents, agentsBytes, classification.agents.after),
      claude: fileEnvelope(classification.claude, claudeBytes, classification.claude.after),
    },
    writes,
    reasons: [classification.agents.classification, classification.claude.classification],
  };
  return envelope;
}

function main(argv) {
  const mode = argv[2];
  const rootIndex = argv.indexOf('--project-root');
  const json = argv.includes('--json');
  if (!['plan', 'check', 'apply'].includes(mode) || rootIndex < 0 || !argv[rootIndex + 1] || !json) {
    console.error('usage: node kaola-workflow-project-instructions.js plan|check|apply --project-root <path> --json');
    process.exit(3);
  }
  const projectRoot = path.resolve(argv[rootIndex + 1]);
  let envelope;
  try { envelope = execute(mode, projectRoot); }
  catch (error) {
    console.error(error.message);
    process.exit(3);
  }
  process.stdout.write(JSON.stringify(envelope) + '\n');
  if (envelope.status === 'decision_required') process.exit(2);
  if (envelope.status === 'drift') process.exit(3);
}

module.exports = {
  AGENTS_MARKER,
  CLAUDE_MARKER,
  LEGACY_REDIRECT,
  classifyProjectInstructions,
  execute,
};

if (require.main === module) main(process.argv);
