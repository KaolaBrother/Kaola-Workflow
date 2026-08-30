#!/usr/bin/env node
'use strict';

// Ownership-safe AGENTS-first project migration. A compatible machine-global
// workflow contract is a prerequisite. Any active run freezes both project
// instruction carriers; this helper never writes run state or adoption receipts.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const consumerTemplates = require('./kaola-workflow-project-instruction-templates.js');

const SCHEMA_VERSION = 1;
const ACTIVE_STATE_SCHEMA_VERSION = 1;
const AGENTS_MARKER = 'KW-AGENTS-MANAGED';
const CLAUDE_MARKER = 'KW-CLAUDE-OVERLAY-MANAGED';
const LEGACY_CLAUDE_MARKER = 'KW-CLAUDE-MANAGED';
const V9_AGENTS_SHA256 = 'c4753d725488152d6dda74dd7ee0cfd490b62a81acddaa293886684abce0d67e';
const V9_CLAUDE_SHA256 = 'a46566fc59e27d84e2f069baa45df014b53b88610d6138b8beb81c349f82e7a3';
const V9_CONSUMER_CLAUDE_SHA256 = 'bc87e84955366368ea91947606df92fc99805716a1ca676aa12b5bbcdd7d1023';
// Exact released 10.1.1 consumer bytes. Its AGENTS marker enclosed only the
// workflow section, so a mixed copy cannot be subtracted safely by marker alone.
// An exact prefix may be replaced while its suffix remains owner content.
const V10_FULL_AGENTS_LENGTH = 5404;
const V10_FULL_AGENTS_SHA256 = '0965bb1427d7606b0869f6c19642658c9599e1be4f9ec8c9562f9cb3bfaec941';
const V10_FULL_CLAUDE_LENGTH = 374;
const V10_FULL_CLAUDE_SHA256 = '3da90dd25f035da7a25db42927337bb65a321d48e0ae889e53838165c7f5f4fc';
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

function knownPrefix(bytes, length, digest) {
  return Buffer.isBuffer(bytes) && bytes.length >= length
    && sha256(bytes.subarray(0, length)) === digest;
}

function globalContractReceiptPath(env = process.env) {
  if (env.KAOLA_GLOBAL_CONTRACT_RECEIPT) return path.resolve(env.KAOLA_GLOBAL_CONTRACT_RECEIPT);
  if (!env.HOME || !path.isAbsolute(env.HOME)) return null;
  return path.join(env.HOME, '.config', 'kaola-workflow', 'global-contract-receipt.json');
}

function inspectGlobalContractReceipt(env = process.env) {
  const file = globalContractReceiptPath(env);
  if (!file) return { compatible: false, reason: 'global_contract_home_unknown', path: null };
  const state = inspectOptional(file);
  if (state.topology !== 'regular') {
    return { compatible: false, reason: 'global_contract_receipt_' + state.topology, path: file };
  }
  let receipt;
  try { receipt = JSON.parse(state.bytes.toString('utf8')); }
  catch (_) {
    return { compatible: false, reason: 'global_contract_receipt_invalid_json', path: file,
      receipt_sha256: sha256(state.bytes) };
  }
  const currentRows = Array.isArray(receipt.targets)
    ? receipt.targets.filter(row => row && ['INSTALLED', 'CURRENT'].includes(row.status)) : [];
  const compatible = receipt.schema_version === 1
    && receipt.contract_schema_version === 1
    && receipt.status === 'CURRENT'
    && currentRows.length > 0
    && typeof receipt.source_sha256 === 'string' && /^[0-9a-f]{64}$/.test(receipt.source_sha256);
  return {
    compatible,
    reason: compatible ? 'compatible' : 'global_contract_receipt_incompatible',
    path: file,
    receipt_sha256: sha256(state.bytes),
    contract_schema_version: receipt.contract_schema_version,
    installed_target_count: currentRows.length,
  };
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

function inspectActiveRuns(projectRoot) {
  const runRoot = path.join(projectRoot, 'kaola-workflow');
  if (!fs.existsSync(runRoot)) return [];
  const runs = [];
  for (const entry of fs.readdirSync(runRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(runRoot, entry.name);
    const state = inspectOptional(path.join(dir, 'workflow-state.md'));
    if (!state.bytes || !/^status:\s*active\s*$/mi.test(state.bytes.toString('utf8'))) continue;
    const text = state.bytes.toString('utf8');
    const declared = [...text.matchAll(/^schema_version:\s*(.*?)\s*$/gmi)]
      .map(match => match[1].trim().replace(/^(["'])(.*)\1$/, '$2'));
    const schemaCompatible = declared.length === 0
      || (declared.length === 1 && declared[0] === String(ACTIVE_STATE_SCHEMA_VERSION));
    const mission = inspectOptional(path.join(dir, 'mission-list.md'));
    runs.push({
      dir,
      name: entry.name,
      compatibility: schemaCompatible
        ? COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT
        : COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE,
      schema_version: declared.length === 0 ? null : declared.join(','),
      state_sha256: sha256(state.bytes),
      mission_sha256: sha256(mission.bytes),
      mission_topology: mission.topology,
    });
  }
  return runs;
}

function activeRunEnvelope(projectRoot, run) {
  return {
    path: path.relative(projectRoot, run.dir),
    schema_version: run.schema_version,
    compatibility: run.compatibility,
    state_sha256: run.state_sha256,
    mission_sha256: run.mission_sha256,
    mission_topology: run.mission_topology,
  };
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

function replaceManaged(existingBytes, templateBytes, marker, legacyMarkers = []) {
  const templateRegion = managedRegion(templateBytes, marker);
  const replacement = templateBytes.subarray(templateRegion.start, templateRegion.end);
  const candidates = [marker, ...legacyMarkers].map(candidate => ({
    marker: candidate,
    region: managedRegion(existingBytes, candidate),
  }));
  if (candidates.some(candidate => candidate.region.kind === 'malformed')) {
    return { classification: 'ambiguous_managed_region' };
  }
  const owned = candidates.filter(candidate => candidate.region.kind === 'managed');
  if (owned.length > 1) return { classification: 'ambiguous_managed_region' };
  if (owned.length === 0) return { classification: 'owner_only' };
  const selected = owned[0];
  const region = selected.region;
  const after = Buffer.concat([region.prefix, replacement, region.suffix]);
  return {
    classification: selected.marker === marker ? 'managed_region' : 'known_legacy_managed_region',
    after, outsideBytesPreserved: true,
    changed: !after.equals(existingBytes),
  };
}

function mergeAgents(existingBytes, templateBytes) {
  if (existingBytes == null || existingBytes.length === 0) {
    return { classification: 'missing', after: templateBytes, outsideBytesPreserved: true, changed: true };
  }
  // The 10.1.1 layout left universal sections outside its narrow managed
  // marker. Only the exact released prefix is migrated below. A mixed copy must
  // remain owner-visible instead of silently retaining half of the old contract.
  const oldRegion = managedRegion(existingBytes, AGENTS_MARKER);
  if (oldRegion.kind === 'managed') {
    const outside = Buffer.concat([oldRegion.prefix, oldRegion.suffix]).toString('utf8');
    if (/## First Principles|## Non-Negotiable Rules|## Kaola-Workflow/.test(outside)) {
      return { classification: 'mixed_legacy_universal_bytes' };
    }
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
  // The released legacy marker bounded only one region inside a complete universal template.
  // It is ownership proof only when the entire released file is byte-identical (handled below),
  // never by itself when owner or changed bytes surround it.
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

const COMPATIBILITY = Object.freeze({
  AUTHORITY_LAYOUT_EQUIVALENT: 'authority_layout_equivalent',
  EXECUTION_DEFAULT_CHANGE: 'execution_default_change',
  STATE_SCHEMA_INCOMPATIBLE: 'state_schema_incompatible',
  UNKNOWN_OR_MIXED: 'unknown_or_mixed',
});

const LAYOUT_EQUIVALENT_CLASSES = new Set([
  'known_v9_consumer_template',
  'known_v9_universal_authority',
  'known_legacy_redirect',
  'known_legacy_plus_owner_bytes',
  'missing',
  'known_legacy_managed_region',
  'owner_overlay_preserved',
  'known_v10_full_template',
  'known_v10_full_template_plus_owner_bytes',
]);

function compatibilityFor(fileKind, classification) {
  const name = classification && classification.classification;
  if (!name) return COMPATIBILITY.UNKNOWN_OR_MIXED;
  if (['ambiguous_managed_region', 'owner_only', 'symbolic_link', 'non_regular'].includes(name)) {
    return COMPATIBILITY.UNKNOWN_OR_MIXED;
  }
  if (name === 'producer_repository_preserved') return COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT;
  if (name === 'state_schema_incompatible' || name === 'active_run_preserved') {
    return COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE;
  }
  if (LAYOUT_EQUIVALENT_CLASSES.has(name)) return COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT;
  if (classification.changed === false) return COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT;
  if (name === 'managed_region') {
    return fileKind === 'claude'
      ? COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT
      : COMPATIBILITY.EXECUTION_DEFAULT_CHANGE;
  }
  return COMPATIBILITY.UNKNOWN_OR_MIXED;
}

function annotateCompatibility(agents, claude) {
  agents.compatibility = compatibilityFor('agents', agents);
  claude.compatibility = compatibilityFor('claude', claude);
  return { agents, claude };
}

function classifyProjectInstructions({ agentsBytes, claudeBytes, activeWorkflowStates = false }) {
  const templates = sourceTemplates();
  const exactV10Agents = knownPrefix(agentsBytes, V10_FULL_AGENTS_LENGTH, V10_FULL_AGENTS_SHA256);
  const exactV10Claude = knownPrefix(claudeBytes, V10_FULL_CLAUDE_LENGTH, V10_FULL_CLAUDE_SHA256);
  if (exactV10Agents && exactV10Claude) {
    const agentsSuffix = agentsBytes.subarray(V10_FULL_AGENTS_LENGTH);
    const claudeSuffix = claudeBytes.subarray(V10_FULL_CLAUDE_LENGTH);
    const agentsAfter = Buffer.concat([templates.agents, agentsSuffix]);
    const claudeAfter = Buffer.concat([templates.claude, claudeSuffix]);
    const agents = {
      classification: agentsSuffix.length === 0
        ? 'known_v10_full_template' : 'known_v10_full_template_plus_owner_bytes',
      after: agentsAfter, outsideBytesPreserved: true, changed: !agentsAfter.equals(agentsBytes),
    };
    const claude = {
      classification: claudeSuffix.length === 0
        ? 'known_v10_full_template' : 'known_v10_full_template_plus_owner_bytes',
      after: claudeAfter, outsideBytesPreserved: true, changed: !claudeAfter.equals(claudeBytes),
    };
    annotateCompatibility(agents, claude);
    return { status: 'planned', changed: true, agents, claude };
  }
  if (sha256(agentsBytes) === V9_AGENTS_SHA256
      && sha256(claudeBytes) === V9_CONSUMER_CLAUDE_SHA256) {
    const agents = { classification: 'known_v9_consumer_template', after: templates.agents, changed: true };
    const claude = { classification: 'known_v9_consumer_template', after: templates.claude, changed: true };
    annotateCompatibility(agents, claude);
    return { status: 'planned', changed: true, agents, claude };
  }
  if (sha256(agentsBytes) === V9_AGENTS_SHA256 && sha256(claudeBytes) === V9_CLAUDE_SHA256) {
    const agents = { classification: 'known_v9_universal_authority', after: templates.agents, changed: true };
    const claude = { classification: 'known_v9_universal_authority', after: templates.claude, changed: true };
    annotateCompatibility(agents, claude);
    return { status: 'planned', changed: true, agents, claude };
  }
  const agents = mergeAgents(agentsBytes, templates.agents);
  const agentsSafe = agents.after != null;
  const claude = mergeClaude(claudeBytes, templates.claude, agentsSafe);
  annotateCompatibility(agents, claude);
  // Direct callers may still classify a hypothetical active state, but execute()
  // returns before classification whenever a real active run exists.
  if (activeWorkflowStates && agents.classification === 'missing') {
    agents.compatibility = COMPATIBILITY.EXECUTION_DEFAULT_CHANGE;
  }
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
    compatibility: classification.compatibility || compatibilityFor(null, classification),
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
  annotateCompatibility(agents, claude);
  return {
    schema_version: SCHEMA_VERSION, mode, status: 'decision_required', changed: false,
    files: {
      agents: fileEnvelope(agents, agentsFile.bytes, null),
      claude: fileEnvelope(claude, claudeFile.bytes, null),
    },
    writes: [], reasons: [agents.classification, claude.classification],
  };
}

function execute(mode, projectRoot, options = {}) {
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
    annotateCompatibility(agents, claude);
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
  const globalContract = inspectGlobalContractReceipt(options.env || process.env);
  if (!globalContract.compatible) {
    const agents = { classification: 'global_contract_incompatible' };
    const claude = { classification: 'global_contract_incompatible' };
    annotateCompatibility(agents, claude);
    return {
      schema_version: SCHEMA_VERSION, mode, status: 'decision_required', changed: false,
      global_contract: globalContract,
      files: {
        agents: fileEnvelope(agents, agentsBytes, null),
        claude: fileEnvelope(claude, claudeBytes, null),
      },
      writes: [], reasons: [globalContract.reason],
    };
  }
  const activeRuns = inspectActiveRuns(projectRoot);
  const activeRun = activeRuns.length > 0;
  // A run keeps the instruction bytes it started with. The global contract may
  // be refreshed independently at machine scope, but workflow-init never changes
  // a project carrier while any local run is active.
  if (activeRun) {
    const agents = { classification: 'active_run_preserved' };
    const claude = { classification: 'active_run_preserved' };
    annotateCompatibility(agents, claude);
    return {
      schema_version: SCHEMA_VERSION, mode, status: 'active_run_preserved', changed: false,
      global_contract: globalContract,
      files: {
        agents: fileEnvelope(agents, agentsBytes, null),
        claude: fileEnvelope(claude, claudeBytes, null),
      },
      active_runs: activeRuns.map(run => activeRunEnvelope(projectRoot, run)),
      writes: [], reasons: ['active_run_preserved'],
    };
  }
  const classification = classifyProjectInstructions({
    agentsBytes, claudeBytes, activeWorkflowStates: activeRun,
  });
  let status = classification.status;
  const writes = [];
  const agentsCompat = classification.agents.compatibility;
  const claudeCompat = classification.claude.compatibility;
  const unknown = agentsCompat === COMPATIBILITY.UNKNOWN_OR_MIXED
    || claudeCompat === COMPATIBILITY.UNKNOWN_OR_MIXED;
  const stateSchema = agentsCompat === COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE
    || claudeCompat === COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE;
  const files = {
    agents: fileEnvelope(classification.agents, agentsBytes, classification.agents.after),
    claude: fileEnvelope(classification.claude, claudeBytes, classification.claude.after),
  };
  const allowWrite = (compat, changed) => {
    if (!changed) return false;
    return !unknown && compat !== COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE;
  };
  const agentsWrite = allowWrite(agentsCompat, classification.agents.changed);
  const claudeWrite = allowWrite(claudeCompat, classification.claude.changed);
  if (classification.status === 'decision_required' || unknown || stateSchema) {
    status = 'decision_required';
  } else if (classification.status === 'planned' && mode === 'check') {
    status = (agentsWrite || claudeWrite) ? 'drift' : status;
  }
  if (mode === 'apply' && (agentsWrite || claudeWrite)) {
    if (agentsWrite) {
      atomicWrite(agentsPath, classification.agents.after, agentsFile.stat);
      writes.push('AGENTS.md');
    }
    if (claudeWrite) {
      atomicWrite(claudePath, classification.claude.after, claudeFile.stat);
      writes.push('CLAUDE.md');
    }
    status = 'applied';
  }
  const envelope = {
    schema_version: SCHEMA_VERSION, mode, status, changed: status === 'applied',
    global_contract: globalContract,
    files,
    active_runs: activeRuns.map(run => activeRunEnvelope(projectRoot, run)),
    writes,
    reasons: [
      classification.agents.classification, classification.claude.classification,
      agentsCompat, claudeCompat,
    ],
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
  let envelope;
  try {
    envelope = execute(mode, path.resolve(argv[rootIndex + 1]));
  }
  catch (error) { console.error(error.message); process.exit(3); }
  process.stdout.write(JSON.stringify(envelope) + '\n');
  if (envelope.status === 'decision_required') process.exit(2);
  if (envelope.status === 'drift') process.exit(3);
}

module.exports = {
  AGENTS_MARKER, CLAUDE_MARKER, LEGACY_CLAUDE_MARKER, LEGACY_REDIRECT,
  V9_AGENTS_SHA256, V9_CLAUDE_SHA256, V9_CONSUMER_CLAUDE_SHA256,
  COMPATIBILITY, compatibilityFor, classifyProjectInstructions, execute,
};

if (require.main === module) main(process.argv);
