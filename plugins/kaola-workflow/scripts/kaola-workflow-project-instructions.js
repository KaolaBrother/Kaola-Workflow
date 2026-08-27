#!/usr/bin/env node
'use strict';

// Ownership-safe AGENTS-first project migration. plan|check|apply classify each managed
// change as authority_layout_equivalent, execution_default_change, state_schema_incompatible,
// or unknown_or_mixed. An active run no longer freezes every instruction file. The helper
// never writes workflow-state.md or mission-list.md.

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

function listActiveRunDirs(projectRoot) {
  return inspectActiveRuns(projectRoot).map(run => run.dir);
}

function writeAdoptionReceipts(projectRoot, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2) + '\n');
  for (const runDir of listActiveRunDirs(projectRoot)) {
    const receiptPath = path.join(runDir, '.cache', 'instruction-adoption.json');
    atomicWrite(receiptPath, body, inspectOptional(receiptPath).stat);
  }
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

function consentPlanDigest(projectRoot, files, activeRuns) {
  return sha256(Buffer.from(JSON.stringify({
    schema_version: SCHEMA_VERSION,
    kind: COMPATIBILITY.EXECUTION_DEFAULT_CHANGE,
    project_root: path.resolve(projectRoot),
    files,
    active_runs: activeRuns.map(run => activeRunEnvelope(projectRoot, run)),
  })));
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
  // Creating the universal first-read authority changes execution defaults for a live run. An
  // active repository with no AGENTS.md therefore needs the same conversation consent as changing
  // an existing managed AGENTS region; outside an active run the missing-file bootstrap is safe.
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
  const activeRuns = inspectActiveRuns(projectRoot);
  const activeRun = activeRuns.length > 0;
  const classification = classifyProjectInstructions({
    agentsBytes, claudeBytes, activeWorkflowStates: activeRun,
  });
  let status = classification.status;
  const writes = [];
  const agentsCompat = classification.agents.compatibility;
  const claudeCompat = classification.claude.compatibility;
  const activeStateSchema = activeRuns.some(run =>
    run.compatibility === COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE);
  const unknown = agentsCompat === COMPATIBILITY.UNKNOWN_OR_MIXED
    || claudeCompat === COMPATIBILITY.UNKNOWN_OR_MIXED;
  const stateSchema = activeStateSchema
    || agentsCompat === COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE
    || claudeCompat === COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE;
  const executionDefault = agentsCompat === COMPATIBILITY.EXECUTION_DEFAULT_CHANGE
    || claudeCompat === COMPATIBILITY.EXECUTION_DEFAULT_CHANGE;
  const files = {
    agents: fileEnvelope(classification.agents, agentsBytes, classification.agents.after),
    claude: fileEnvelope(classification.claude, claudeBytes, classification.claude.after),
  };
  const planDigest = consentPlanDigest(projectRoot, files, activeRuns);
  const suppliedConsent = options.executionDefaultConsent || null;
  const consentAuthorized = mode === 'apply' && activeRun && executionDefault
    && suppliedConsent === planDigest && !unknown && !stateSchema;
  const consentMismatch = suppliedConsent != null && !consentAuthorized;
  const agentsAuthorityAlreadyPresent = managedRegion(agentsBytes, AGENTS_MARKER).kind === 'managed';
  const allowWrite = (fileKind, compat, changed) => {
    if (!changed) return false;
    if (unknown || consentMismatch || compat === COMPATIBILITY.STATE_SCHEMA_INCOMPATIBLE) return false;
    // An unknown active state fences AGENTS execution authority, but it is not a repository-wide
    // freeze bit. A thin Claude bridge is independent when the current AGENTS authority already
    // exists; if AGENTS itself still needs layout migration, the bridge depends on that blocked
    // change and must remain untouched with it.
    if (activeStateSchema) {
      return fileKind === 'claude'
        && compat === COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT
        && agentsAuthorityAlreadyPresent;
    }
    if (!activeRun) return true;
    if (executionDefault && !consentAuthorized) return false;
    if (compat === COMPATIBILITY.EXECUTION_DEFAULT_CHANGE) return consentAuthorized;
    return compat === COMPATIBILITY.AUTHORITY_LAYOUT_EQUIVALENT;
  };
  const agentsWrite = allowWrite('agents', agentsCompat, classification.agents.changed);
  const claudeWrite = allowWrite('claude', claudeCompat, classification.claude.changed);
  if (classification.status === 'decision_required' || unknown || consentMismatch) {
    status = 'decision_required';
  } else if (stateSchema && !agentsWrite && !claudeWrite) {
    status = 'active_run_preserved';
  } else if (activeRun && executionDefault && !consentAuthorized) {
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
    files,
    active_runs: activeRuns.map(run => activeRunEnvelope(projectRoot, run)),
    writes,
    reasons: [
      classification.agents.classification, classification.claude.classification,
      agentsCompat, claudeCompat,
      ...activeRuns.map(run => run.compatibility),
      ...(consentMismatch ? ['consent_plan_mismatch'] : []),
    ],
  };
  if (mode === 'plan' && activeRun && executionDefault && !unknown && !stateSchema) {
    envelope.consent = {
      kind: COMPATIBILITY.EXECUTION_DEFAULT_CHANGE,
      ephemeral: true,
      plan_sha256: planDigest,
      apply_args: ['--consent-execution-default-change', planDigest],
    };
  }
  // Recovery evidence only. Init does not inspect or mutate the installed runtime adapter;
  // a restart remains a carrier change owned by that adapter.
  if (mode === 'apply' && status === 'applied' && activeRun && !consentAuthorized) {
    writeAdoptionReceipts(projectRoot, {
      schema_version: 1,
      kind: 'instruction_adoption',
      files: envelope.files,
      writes: envelope.writes,
      reasons: envelope.reasons,
      fresh_session_requirement: 'not_inspected_by_init',
    });
  }
  return envelope;
}

function main(argv) {
  const mode = argv[2];
  const rootIndex = argv.indexOf('--project-root');
  const json = argv.includes('--json');
  const consentIndexes = argv.reduce((out, value, index) => {
    if (value === '--consent-execution-default-change') out.push(index);
    return out;
  }, []);
  const consentValid = consentIndexes.length <= 1
    && (consentIndexes.length === 0 || (
      argv[consentIndexes[0] + 1]
      && !argv[consentIndexes[0] + 1].startsWith('--')
    ));
  if (!['plan', 'check', 'apply'].includes(mode) || rootIndex < 0 || !argv[rootIndex + 1] || !json
      || !consentValid) {
    console.error('usage: node kaola-workflow-project-instructions.js plan|check|apply --project-root <path> --json [--consent-execution-default-change <plan-sha256>]');
    process.exit(3);
  }
  let envelope;
  try {
    envelope = execute(mode, path.resolve(argv[rootIndex + 1]), {
      executionDefaultConsent: consentIndexes.length === 1 ? argv[consentIndexes[0] + 1] : null,
    });
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
