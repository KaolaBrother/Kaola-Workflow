#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const consumerTemplates = require('./kaola-workflow-project-instruction-templates.js');

const SCHEMA_VERSION = 1;
const AGENTS_MARKER = 'KW-AGENTS-MANAGED';
const CLAUDE_MARKER = 'KW-CLAUDE-OVERLAY-MANAGED';
const V9_AGENTS_SHA256 = 'c4753d725488152d6dda74dd7ee0cfd490b62a81acddaa293886684abce0d67e';
const V9_CLAUDE_SHA256 = 'a46566fc59e27d84e2f069baa45df014b53b88610d6138b8beb81c349f82e7a3';
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

function inspectOptional(file) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) {
    if (error && error.code === 'ENOENT') return { bytes: null, stat: null, topology: 'missing' };
    throw error;
  }
  if (stat.isSymbolicLink()) return { bytes: null, stat, topology: 'symbolic_link' };
  if (!stat.isFile()) return { bytes: null, stat, topology: 'non_regular' };
  return { bytes: fs.readFileSync(file), stat, topology: 'regular' };
}

function markerTokens(marker) {
  return {
    start: Buffer.from('<!-- ' + marker + '-START -->'),
    end: Buffer.from('<!-- ' + marker + '-END -->'),
  };
}

function allIndexes(bytes, token) {
  const out = [];
  let offset = 0;
  while (offset <= bytes.length - token.length) {
    const found = bytes.indexOf(token, offset);
    if (found < 0) break;
    out.push(found);
    offset = found + token.length;
  }
  return out;
}

function managedRegion(bytes, marker) {
  bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '');
  const tokens = markerTokens(marker);
  const starts = allIndexes(bytes, tokens.start);
  const ends = allIndexes(bytes, tokens.end);
  if (starts.length === 0 && ends.length === 0) return { kind: 'absent' };
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) return { kind: 'malformed' };
  const start = starts[0];
  const end = ends[0] + tokens.end.length;
  return {
    kind: 'managed', start, end,
    prefix: bytes.subarray(0, start), suffix: bytes.subarray(end),
  };
}

function hasActiveRun(projectRoot) {
  const runRoot = path.join(projectRoot, 'kaola-workflow');
  if (!fs.existsSync(runRoot)) return false;
  for (const entry of fs.readdirSync(runRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const state = inspectOptional(path.join(runRoot, entry.name, 'workflow-state.md'));
    if (state.bytes && /^status:\s*active\s*$/mi.test(state.bytes.toString('utf8'))) return true;
  }
  return false;
}

function isProducerRepository(projectRoot) {
  const packageFile = inspectOptional(path.join(projectRoot, 'package.json'));
  if (!packageFile.bytes) return false;
  let pkg;
  try { pkg = JSON.parse(packageFile.bytes.toString('utf8')); } catch (_) { return false; }
  return pkg && pkg.name === 'kaola-workflow'
    && fs.existsSync(path.join(projectRoot, 'templates', 'agents', 'behavior-contracts.json'))
    && fs.existsSync(path.join(projectRoot, 'scripts', 'generate-agent-profiles.js'));
}

function sourceTemplates() {
  const agents = Buffer.from(consumerTemplates.AGENTS_TEMPLATE);
  const claude = Buffer.from(consumerTemplates.CLAUDE_TEMPLATE);
  if (managedRegion(agents, AGENTS_MARKER).kind !== 'managed'
      || managedRegion(claude, CLAUDE_MARKER).kind !== 'managed'
      || claude.toString('utf8').split(/\r?\n/).filter(line => line === '@AGENTS.md').length !== 1) {
    throw new Error('distribution-owned consumer instruction templates are malformed');
  }
  return { agents, claude };
}

function replaceManaged(existingBytes, templateBytes, marker) {
  const templateRegion = managedRegion(templateBytes, marker);
  const replacement = templateBytes.subarray(templateRegion.start, templateRegion.end);
  const region = managedRegion(existingBytes, marker);
  if (region.kind === 'malformed') return { classification: 'ambiguous_managed_region' };
  if (region.kind !== 'managed') return { classification: 'owner_only' };
  const after = Buffer.concat([region.prefix, replacement, region.suffix]);
  return {
    classification: 'managed_region', after, outsideBytesPreserved: true,
    changed: !after.equals(existingBytes),
  };
}

function mergeAgents(existingBytes, templateBytes) {
  if (existingBytes == null || existingBytes.length === 0) {
    return { classification: 'missing', after: templateBytes, outsideBytesPreserved: true, changed: true };
  }
  const managed = replaceManaged(existingBytes, templateBytes, AGENTS_MARKER);
  if (managed.after != null || managed.classification === 'ambiguous_managed_region') return managed;
  const legacy = Buffer.from(LEGACY_REDIRECT);
  if (existingBytes.length >= legacy.length && existingBytes.subarray(0, legacy.length).equals(legacy)) {
    const suffix = existingBytes.subarray(legacy.length);
    return {
      classification: suffix.length === 0 ? 'known_legacy_redirect' : 'known_legacy_plus_owner_bytes',
      after: Buffer.concat([templateBytes, suffix]), outsideBytesPreserved: true, changed: true,
    };
  }
  return managed;
}

function explicitClaudeOverlay(existingBytes) {
  const prefix = Buffer.from('# Claude owner overlay');
  return existingBytes.length >= prefix.length && existingBytes.subarray(0, prefix.length).equals(prefix);
}

function mergeClaude(existingBytes, templateBytes, allowExplicitOverlay) {
  if (existingBytes == null || existingBytes.length === 0) {
    return { classification: 'missing', after: templateBytes, outsideBytesPreserved: true, changed: true };
  }
  const managed = replaceManaged(existingBytes, templateBytes, CLAUDE_MARKER);
  if (managed.after != null || managed.classification === 'ambiguous_managed_region') return managed;
  if (allowExplicitOverlay && explicitClaudeOverlay(existingBytes)) {
    return {
      classification: 'owner_overlay_preserved',
      after: Buffer.concat([templateBytes, existingBytes]), outsideBytesPreserved: true, changed: true,
    };
  }
  return managed;
}

function classifyProjectInstructions({ agentsBytes, claudeBytes, activeWorkflowStates = false }) {
  if (activeWorkflowStates) {
    return {
      status: 'active_run_preserved', changed: false,
      agents: { classification: 'active_run_preserved' },
      claude: { classification: 'active_run_preserved' },
    };
  }
  const templates = sourceTemplates();
  if (sha256(agentsBytes) === V9_AGENTS_SHA256 && sha256(claudeBytes) === V9_CLAUDE_SHA256) {
    return {
      status: 'planned', changed: true,
      agents: { classification: 'known_v9_universal_authority', after: templates.agents, changed: true },
      claude: { classification: 'known_v9_universal_authority', after: templates.claude, changed: true },
    };
  }
  const agents = mergeAgents(agentsBytes, templates.agents);
  const agentsSafe = agents.after != null;
  const claude = mergeClaude(claudeBytes, templates.claude, agentsSafe);
  if (!agentsSafe || claude.after == null) {
    return { status: 'decision_required', changed: false, agents, claude };
  }
  return {
    status: agents.changed || claude.changed ? 'planned' : 'converged',
    changed: !!(agents.changed || claude.changed), agents, claude,
  };
}

function fileEnvelope(classification, beforeBytes, afterBytes) {
  const after = afterBytes == null ? beforeBytes : afterBytes;
  return {
    classification: classification.classification,
    before_sha256: sha256(beforeBytes), after_sha256: sha256(after),
    outside_bytes_preserved: classification.outsideBytesPreserved === true,
  };
}

function atomicWrite(file, content, priorStat) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = inspectOptional(file);
  if (current.topology === 'symbolic_link' || current.topology === 'non_regular') {
    throw new Error(file + ' is not a regular owned instruction file');
  }
  const mode = priorStat ? priorStat.mode & 0o777 : 0o644;
  const temporary = file + '.kw-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  try {
    fs.writeFileSync(temporary, content, { mode });
    fs.chmodSync(temporary, mode);
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) { /* best-effort temp cleanup */ }
    throw error;
  }
}

function decisionForTopology(mode, agentsFile, claudeFile) {
  const bad = [agentsFile, claudeFile].some(file =>
    file.topology === 'symbolic_link' || file.topology === 'non_regular');
  if (!bad) return null;
  const agents = { classification: agentsFile.topology };
  const claude = { classification: claudeFile.topology };
  return {
    schema_version: SCHEMA_VERSION, mode, status: 'decision_required', changed: false,
    files: {
      agents: fileEnvelope(agents, agentsFile.bytes, null),
      claude: fileEnvelope(claude, claudeFile.bytes, null),
    },
    writes: [], reasons: [agents.classification, claude.classification],
  };
}

function execute(mode, projectRoot) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const claudePath = path.join(projectRoot, 'CLAUDE.md');
  const agentsFile = inspectOptional(agentsPath);
  const claudeFile = inspectOptional(claudePath);
  const topologyDecision = decisionForTopology(mode, agentsFile, claudeFile);
  if (topologyDecision) return topologyDecision;
  // The producer repository carries a richer project-specific universal contract. Consumer
  // templates must never overwrite it merely because the same workflow-init helper runs here.
  if (isProducerRepository(projectRoot)) {
    const agents = { classification: 'producer_repository_preserved' };
    const claude = { classification: 'producer_repository_preserved' };
    return {
      schema_version: SCHEMA_VERSION, mode, status: 'producer_repository_preserved', changed: false,
      files: {
        agents: fileEnvelope(agents, agentsFile.bytes, null),
        claude: fileEnvelope(claude, claudeFile.bytes, null),
      },
      writes: [], reasons: [agents.classification, claude.classification],
    };
  }
  const agentsBytes = agentsFile.bytes;
  const claudeBytes = claudeFile.bytes;
  const classification = classifyProjectInstructions({
    agentsBytes, claudeBytes, activeWorkflowStates: hasActiveRun(projectRoot),
  });
  let status = classification.status;
  const writes = [];
  if (status === 'planned' && mode === 'check') status = 'drift';
  if (classification.status === 'planned' && mode === 'apply') {
    if (classification.agents.changed) {
      atomicWrite(agentsPath, classification.agents.after, agentsFile.stat);
      writes.push('AGENTS.md');
    }
    if (classification.claude.changed) {
      atomicWrite(claudePath, classification.claude.after, claudeFile.stat);
      writes.push('CLAUDE.md');
    }
    status = 'applied';
  }
  return {
    schema_version: SCHEMA_VERSION, mode, status, changed: status === 'applied',
    files: {
      agents: fileEnvelope(classification.agents, agentsBytes, classification.agents.after),
      claude: fileEnvelope(classification.claude, claudeBytes, classification.claude.after),
    },
    writes, reasons: [classification.agents.classification, classification.claude.classification],
  };
}

function main(argv) {
  const mode = argv[2];
  const rootIndex = argv.indexOf('--project-root');
  const json = argv.includes('--json');
  if (!['plan', 'check', 'apply'].includes(mode) || rootIndex < 0 || !argv[rootIndex + 1] || !json) {
    console.error('usage: node kaola-workflow-project-instructions.js plan|check|apply --project-root <path> --json');
    process.exit(3);
  }
  let envelope;
  try { envelope = execute(mode, path.resolve(argv[rootIndex + 1])); }
  catch (error) { console.error(error.message); process.exit(3); }
  process.stdout.write(JSON.stringify(envelope) + '\n');
  if (envelope.status === 'decision_required') process.exit(2);
  if (envelope.status === 'drift') process.exit(3);
}

module.exports = {
  AGENTS_MARKER, CLAUDE_MARKER, LEGACY_REDIRECT,
  V9_AGENTS_SHA256, V9_CLAUDE_SHA256,
  classifyProjectInstructions, execute,
};

if (require.main === module) main(process.argv);
