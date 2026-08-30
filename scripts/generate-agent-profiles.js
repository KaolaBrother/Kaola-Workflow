#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BEHAVIOR_SOURCE = 'templates/agents/behavior-contracts.json';
const ADAPTER_SOURCE = 'templates/agents/runtime-capabilities.json';
const PROVENANCE_SOURCE = 'templates/agents/provenance.json';
const MANIFEST_PATH = 'agents/generated-agent-manifest.json';
const CODEX_CONFIG_PATHS = Object.freeze([
  'plugins/kaola-workflow/config/agents.toml',
  'plugins/kaola-workflow-gitlab/config/agents.toml',
  'plugins/kaola-workflow-gitea/config/agents.toml',
]);
const ZERO_HASH = '0'.repeat(64);
const ROLES = Object.freeze([
  'adversarial-verifier',
  'build-error-resolver',
  'code-architect',
  'code-explorer',
  'code-reviewer',
  'doc-updater',
  'implementer',
  'investigator',
  'knowledge-lookup',
  'metric-optimizer',
  'planner',
  'security-reviewer',
  'synthesizer',
  'tdd-guide',
]);
const RUNTIMES = Object.freeze(['claude', 'codex', 'opencode', 'kimi', 'grok', 'cursor', 'zcode']);
const REQUIRED_COVERAGE = Object.freeze([
  'purpose', 'inputs', 'authority_custody', 'writes', 'deliverable', 'verification', 'stop_conditions',
]);
const REQUIRED_CAPABILITIES = Object.freeze([
  'named_roles',
  'deterministic_profiles',
  'capability_gap',
  'instruction_loading',
  'profile_format',
  'role_dispatch',
  'model_carrier',
  'tool_binding',
  'hook_scope',
  'intent_mapping',
  'delegation_guidance',
]);
const DELEGATION_GUIDANCE_START = '<!-- KW-RUNTIME-DELEGATION-START -->';
const DELEGATION_GUIDANCE_END = '<!-- KW-RUNTIME-DELEGATION-END -->';
const RETIRED_VOCABULARY_BAN = /\bnode-id\b|\bgate_effect\b|\bgate_mode\b|\bgate_aggregation\b|\bchange_gate\b|\breplicated_majority\b|\bpartitioned_all\b|\bexecution_status\b|\bclaim_outcome\b|\breview_scope_expanded\b|\bdomain_outcome:/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function loadBehaviorContracts(root = ROOT) {
  const source = readJson(root, BEHAVIOR_SOURCE);
  validateBehaviorContracts(source);
  return source;
}

function loadRuntimeAdapters(root = ROOT) {
  const source = readJson(root, ADAPTER_SOURCE);
  validateRuntimeAdapters(source);
  return source;
}

function loadProvenance(root = ROOT) {
  const source = readJson(root, PROVENANCE_SOURCE);
  validateProvenance(source);
  return source;
}

function validateBehaviorContracts(source) {
  if (!source || source.schema_version !== 1 || !source.roles) {
    throw new Error('behavior-contracts: schema_version 1 and roles are required');
  }
  const roleNames = Object.keys(source.roles).sort();
  if (JSON.stringify(roleNames) !== JSON.stringify([...ROLES].sort())) {
    throw new Error('behavior-contracts: expected exactly ' + ROLES.join(', '));
  }
  const forbidden = JSON.stringify(source).match(
    /\b(?:Claude|Codex|OpenCode|Kimi|Grok|Cursor|ZCode|sonnet|opus|fable)\b|(?:^|["'\s])(?:~\/|\$HOME\/|\.claude\/|\.codex\/)/i);
  if (forbidden) throw new Error('behavior-contracts: runtime-specific token ' + forbidden[0]);
  for (const role of ROLES) {
    const contract = source.roles[role];
    if (!Number.isInteger(contract.behavior_contract_version)
        || !contract.description || !contract.body
        || !['standard', 'reasoning', 'heavy'].includes(contract.intent_class)) {
      throw new Error('behavior-contracts: incomplete role ' + role);
    }
    if (!contract.coverage || REQUIRED_COVERAGE.some(key => !contract.coverage[key])) {
      throw new Error('behavior-contracts: incomplete coverage for ' + role);
    }
    if (!Array.isArray(contract.capability_requirements)
        || !contract.capability_requirements.includes('repository_read')) {
      throw new Error('behavior-contracts: capability requirements missing for ' + role);
    }
  }
}

function adapterEntries(source) {
  return Object.entries(source.runtimes || {}).map(([name, adapter]) => ({ name, adapter }));
}

function validateRuntimeAdapters(source) {
  if (!source || source.schema_version !== 1 || !source.evidence || !source.runtimes) {
    throw new Error('runtime-capabilities: schema_version 1, evidence, and runtimes are required');
  }
  const runtimeSet = new Set();
  for (const { name, adapter } of adapterEntries(source)) {
    if (!RUNTIMES.includes(adapter.runtime)) throw new Error('runtime-capabilities: invalid runtime ' + name);
    runtimeSet.add(adapter.runtime);
    if (!Array.isArray(adapter.evidence) || adapter.evidence.length === 0
        || adapter.evidence.some(id => !source.evidence[id])) {
      throw new Error('runtime-capabilities: missing evidence for ' + name);
    }
    if (!adapter.capabilities || REQUIRED_CAPABILITIES.some(key =>
      !Object.prototype.hasOwnProperty.call(adapter.capabilities, key))) {
      throw new Error('runtime-capabilities: incomplete capabilities for ' + name);
    }
    const mapping = adapter.capabilities.intent_mapping;
    if (!mapping || ['standard', 'reasoning', 'heavy'].some(intent => !mapping[intent])) {
      throw new Error('runtime-capabilities: incomplete intent mapping for ' + name);
    }
    const guidance = adapter.capabilities.delegation_guidance;
    if (!guidance || typeof guidance.profile_lookup !== 'string'
        || typeof guidance.dispatch_carrier !== 'string'
        || typeof guidance.tool_boundary !== 'string'
        || typeof guidance.native_routes !== 'string'
        || typeof guidance.availability !== 'string'
        || !guidance.tiers
        || ['standard', 'reasoning', 'heavy'].some(intent =>
          typeof guidance.tiers[intent] !== 'string' || !guidance.tiers[intent].trim())) {
      throw new Error('runtime-capabilities: incomplete delegation guidance for ' + name);
    }
    if (['cursor', 'zcode'].includes(adapter.runtime)
        && (typeof adapter.capabilities.model !== 'string' || !adapter.capabilities.model.trim())) {
      throw new Error('runtime-capabilities: model carrier missing for ' + name);
    }
    if (adapter.runtime === 'cursor') {
      const conformance = adapter.capabilities.dispatch_conformance;
      if (!conformance
          || conformance.call_shape !== 'Task with flat subagent_type'
          || conformance.named_model_field !== 'omit'
          || conformance.exact_tier !== 'post_resolution_assertion'
          || conformance.generic_model_enum !== 'not_named_profile_capability'
          || conformance.provider_model_evidence !== 'providerOptions.cursor.modelName'
          || conformance.tui_child_transcript !== 'insufficient') {
        throw new Error('runtime-capabilities: incomplete Cursor dispatch conformance');
      }
    }
  }
  if (JSON.stringify([...runtimeSet].sort()) !== JSON.stringify([...RUNTIMES].sort())) {
    throw new Error('runtime-capabilities: expected all seven runtime families');
  }
  if (adapterEntries(source).filter(entry => entry.adapter.runtime === 'codex').length !== 3) {
    throw new Error('runtime-capabilities: expected three forge-neutral Codex adapters');
  }
}

function validateProvenance(source) {
  if (!source || source.schema_version !== 1 || !source.origins || !source.roles) {
    throw new Error('provenance: schema_version 1, origins, and roles are required');
  }
  for (const role of ROLES) {
    const record = source.roles[role];
    if (!record || !['ecc_derived', 'kaola_local'].includes(record.source_kind)) {
      throw new Error('provenance: missing role ' + role);
    }
    if (record.source_kind === 'ecc_derived') {
      for (const field of ['origin', 'upstream_path', 'source_commit', 'source_blob_sha', 'source_sha256']) {
        if (!record[field]) throw new Error('provenance: ' + role + ' missing ' + field);
      }
    }
  }
}

function behaviorHash(contract) {
  return sha256(JSON.stringify(canonical(contract)));
}

function adapterHash(adapter) {
  const {
    delegation_guidance: _routingOnly,
    dispatch_conformance: _dispatchOnly,
    ...profileCapabilities
  } = adapter.capabilities;
  return sha256(JSON.stringify(canonical({
    runtime: adapter.runtime,
    capabilities: profileCapabilities,
  })));
}

function rolesByIntent(behaviorSource = loadBehaviorContracts()) {
  const rosters = { standard: [], reasoning: [], heavy: [] };
  for (const [role, contract] of Object.entries(behaviorSource.roles)) {
    rosters[contract.intent_class].push(role);
  }
  for (const tier of Object.keys(rosters)) rosters[tier].sort();
  return rosters;
}

function renderRuntimeDelegationGuidance(adapter, behaviorSource = loadBehaviorContracts()) {
  if (!adapter || !adapter.runtime || !adapter.capabilities) {
    throw new Error('runtime delegation guidance requires one runtime adapter');
  }
  const guidance = adapter.capabilities.delegation_guidance;
  if (!guidance) throw new Error('runtime delegation guidance missing for ' + adapter.runtime);
  const rosters = rolesByIntent(behaviorSource);
  return [
    DELEGATION_GUIDANCE_START,
    '## Runtime adapter facts',
    '',
    guidance.profile_lookup,
    guidance.dispatch_carrier,
    '',
    '**Tier defaults:** standard — ' + guidance.tiers.standard + '; reasoning — '
      + guidance.tiers.reasoning + '; heavy — ' + guidance.tiers.heavy + '.',
    '**Role roster:** standard — ' + rosters.standard.map(role => '`' + role + '`').join(', ')
      + '; reasoning — ' + rosters.reasoning.map(role => '`' + role + '`').join(', ')
      + '; heavy — ' + rosters.heavy.map(role => '`' + role + '`').join(', ') + '.',
    '',
    guidance.tool_boundary,
    guidance.native_routes,
    guidance.availability,
    '',
    guidance.fallback_search,
    DELEGATION_GUIDANCE_END,
  ].join('\n');
}

function runtimeAdapter(runtime, forge = 'github', root = ROOT) {
  const adapters = loadRuntimeAdapters(root);
  const name = runtime === 'codex' ? 'codex-' + forge : runtime;
  const adapter = adapters.runtimes[name];
  if (!adapter || adapter.runtime !== runtime) {
    throw new Error('runtime-capabilities: adapter not found for ' + runtime + '/' + forge);
  }
  return adapter;
}

function renderRuntimeDelegationGuidanceForRuntime(runtime, forge = 'github', root = ROOT) {
  return renderRuntimeDelegationGuidance(
    runtimeAdapter(runtime, forge, root), loadBehaviorContracts(root));
}

function replaceRuntimeDelegationGuidance(content, runtime, forge = 'github', root = ROOT) {
  const text = String(content);
  const start = text.indexOf(DELEGATION_GUIDANCE_START);
  const end = text.indexOf(DELEGATION_GUIDANCE_END);
  if (start < 0 || end < start
      || text.indexOf(DELEGATION_GUIDANCE_START, start + 1) >= 0
      || text.indexOf(DELEGATION_GUIDANCE_END, end + 1) >= 0) {
    throw new Error('runtime delegation guidance marker missing or duplicated for ' + runtime + '/' + forge);
  }
  const rendered = renderRuntimeDelegationGuidanceForRuntime(runtime, forge, root);
  return text.slice(0, start) + rendered + text.slice(end + DELEGATION_GUIDANCE_END.length);
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function nativeTools(contract, runtime = 'claude') {
  const required = new Set(contract.capability_requirements);
  const tools = ['Read', 'Grep', 'Glob'];
  if (required.has('scoped_write')) tools.splice(1, 0, 'Write', 'Edit');
  if (required.has('command_execution')) tools.push('Bash');
  if (required.has('external_research')) {
    tools.push('WebSearch', runtime === 'kimi' ? 'FetchURL' : 'WebFetch');
  }
  return tools;
}

function runtimeAppendix(runtime, adapter, contract, behaviorSha) {
  const capabilitySha = adapterHash(adapter);
  const lines = [
    '<!-- runtime-adapter:start -->',
    'runtime: ' + runtime,
    'behavior_contract_version: ' + contract.behavior_contract_version,
    'behavior_contract_hash: ' + behaviorSha,
    'adapter_capabilities_hash: ' + capabilitySha,
  ];
  if (runtime !== 'claude') lines.push('resolved_profile_hash: ' + ZERO_HASH);
  lines.push('',
    '## Runtime adapter',
    '',
    '- Follow the native carrier and capability boundary declared for this runtime.',
    '- If a required capability is unavailable, stop without mutation and report `capability_gap: <missing capability> — <required action>`.',
    '<!-- runtime-adapter:end -->',
  );
  return lines.join('\n');
}

function markdownFrontmatter(runtime, role, contract, adapter) {
  const capabilities = adapter.capabilities;
  const intent = capabilities.intent_mapping[contract.intent_class];
  const lines = [
    '---',
    'name: ' + (runtime === 'kimi' ? 'kaola-role-' + role : role),
    'description: ' + yamlScalar(contract.description),
  ];
  if (runtime === 'claude') {
    if ((contract.nickname_candidates || []).length > 0) {
      lines.push('nickname_candidates: ' + JSON.stringify(contract.nickname_candidates));
    }
    lines.push('tools: ' + JSON.stringify(nativeTools(contract, runtime)));
    lines.push('model: ' + intent);
    lines.push('behavior_contract_version: ' + contract.behavior_contract_version);
    lines.push('behavior_contract_hash: ' + behaviorHash(contract));
    lines.push('resolved_profile_hash: ' + ZERO_HASH);
  } else if (runtime === 'opencode') {
    lines.push('mode: subagent');
    const denied = [];
    if (!contract.capability_requirements.includes('scoped_write')) denied.push('edit');
    if (!contract.capability_requirements.includes('command_execution')) denied.push('bash');
    if (!contract.capability_requirements.includes('external_research')) denied.push('webfetch');
    if (denied.length > 0) {
      lines.push('permission:');
      for (const capability of denied) lines.push('  ' + capability + ': deny');
    }
  } else if (runtime === 'kimi') {
    lines.push('tools: ' + JSON.stringify(nativeTools(contract, runtime)));
  } else if (runtime === 'grok') {
    lines.push('promptMode: full');
    lines.push('model: inherit');
    lines.push('effort: ' + intent);
    lines.push('agentsMd: true');
    lines.push('tools: ' + JSON.stringify(nativeTools(contract, runtime)));
  } else if (runtime === 'cursor') {
    lines.push('model: ' + capabilities.model + '[effort=' + intent + ']');
    lines.push('readonly: ' + (contract.capability_requirements.includes('scoped_write') ? 'false' : 'true'));
  } else if (runtime === 'zcode') {
    lines.push('model: ' + capabilities.model);
    lines.push('thoughtLevel: ' + intent);
    lines.push('tools: ' + JSON.stringify(nativeTools(contract, runtime)));
  }
  lines.push('---', '');
  return lines.join('\n');
}

function runtimeRestrictions(runtime, contract) {
  const restrictions = [];
  if (runtime === 'kimi') {
    if (!contract.capability_requirements.includes('scoped_write')) {
      restrictions.push('- Runtime capability restriction: this role may not edit project files.');
    }
    if (!contract.capability_requirements.includes('command_execution')) {
      restrictions.push('- Runtime capability restriction: this role may not run shell commands.');
    }
  }
  return restrictions.length > 0 ? restrictions.join('\n') + '\n\n' : '';
}

function renderMarkdown(runtime, role, contract, adapter) {
  const behaviorSha = behaviorHash(contract);
  const zeroed = markdownFrontmatter(runtime, role, contract, adapter)
    + '<!-- kaola-workflow-managed-agent: true -->\n\n'
    + runtimeRestrictions(runtime, contract)
    + contract.body.trim() + '\n\n'
    + runtimeAppendix(runtime, adapter, contract, behaviorSha) + '\n';
  return normalizeResolvedProfileHash(zeroed).replace(ZERO_HASH, sha256(normalizeResolvedProfileHash(zeroed)));
}

function tomlArray(values) {
  return '[' + values.map(value => JSON.stringify(String(value))).join(', ') + ']';
}

function renderCodex(role, contract, adapter) {
  const behaviorSha = behaviorHash(contract);
  const zeroedInstructions = contract.body.trim() + '\n\n'
    + runtimeAppendix('codex', adapter, contract, behaviorSha) + '\n';
  if (zeroedInstructions.includes("'''")) throw new Error(role + ': TOML literal delimiter in behavior');
  const zeroed = [
    'name = ' + JSON.stringify(role),
    'description = ' + JSON.stringify(contract.description),
    ...((contract.nickname_candidates || []).length > 0
      ? ['nickname_candidates = ' + tomlArray(contract.nickname_candidates)] : []),
    "developer_instructions = '''",
    zeroedInstructions.trimEnd(),
    "'''",
    '',
  ].join('\n');
  return normalizeResolvedProfileHash(zeroed).replace(ZERO_HASH, sha256(normalizeResolvedProfileHash(zeroed)));
}

function profilePath(adapterName, runtime, role) {
  if (runtime === 'claude') return 'agents/' + role + '.md';
  if (runtime === 'codex') {
    const suffix = adapterName.replace(/^codex-/, '');
    const plugin = suffix === 'github' ? 'kaola-workflow' : 'kaola-workflow-' + suffix;
    return 'plugins/' + plugin + '/agents/' + role + '.toml';
  }
  return 'logical/' + runtime + '/agents/' + role + '.md';
}

function renderProfiles(behavior, adapters) {
  validateBehaviorContracts(behavior);
  validateRuntimeAdapters(adapters);
  const profiles = [];
  for (const { name, adapter } of adapterEntries(adapters)) {
    for (const role of ROLES) {
      const contract = behavior.roles[role];
      const content = adapter.runtime === 'codex'
        ? renderCodex(role, contract, adapter)
        : renderMarkdown(adapter.runtime, role, contract, adapter);
      profiles.push({
        runtime: adapter.runtime,
        variant: name,
        role,
        path: profilePath(name, adapter.runtime, role),
        behavior_contract_version: contract.behavior_contract_version,
        behavior_sha256: behaviorHash(contract),
        resolved_profile_sha256: sha256(content),
        content,
      });
    }
  }
  return profiles;
}

function normalizeResolvedProfileHash(content) {
  return String(content).replace(/(resolved_profile_hash:\s*)[a-f0-9]{64}/g, '$1' + ZERO_HASH);
}

function roleFromProfile(content) {
  const markdown = String(content).match(/^name:\s*([^\n]+)$/m);
  const toml = String(content).match(/^name\s*=\s*"([^"]+)"$/m);
  const raw = markdown ? markdown[1].trim().replace(/^['"]|['"]$/g, '') : toml ? toml[1] : '';
  return raw.replace(/^kaola-role-/, '');
}

function behaviorIdentityFromCore(content, root = ROOT) {
  const role = roleFromProfile(content);
  const contract = loadBehaviorContracts(root).roles[role];
  if (!contract) throw new Error('behavior_contract_role_unknown: ' + (role || '<absent>'));
  const version = String(content).match(/^behavior_contract_version:\s*(\d+)\s*$/m);
  const hash = String(content).match(/^behavior_contract_hash:\s*([a-f0-9]{64})\s*$/m);
  if (!version || !hash) throw new Error('behavior_contract_identity_missing: ' + role);
  return {
    role,
    behavior_contract_version: Number(version[1]),
    behavior_contract_hash: hash[1],
    core: contract.body.trim(),
  };
}

function verifyResolvedProfileHash(content) {
  const matches = [...String(content).matchAll(/^resolved_profile_hash:\s*([a-f0-9]{64})\s*$/gm)];
  if (matches.length !== 1) throw new Error('resolved_profile_hash_count: ' + matches.length);
  const normalized = normalizeResolvedProfileHash(content);
  const expected = sha256(normalized);
  if (matches[0][1] !== expected) throw new Error('resolved_profile_hash_mismatch');
  return true;
}

function trackedProfiles(profiles) {
  return profiles.filter(profile => profile.runtime === 'claude' || profile.runtime === 'codex');
}

function renderCodexConfig(behaviorSource) {
  return ROLES.map(role => {
    const contract = behaviorSource.roles[role];
    return [
      `[agents.${role}]`,
      `description = ${JSON.stringify(contract.description)}`,
      `config_file = "./agents/kaola-workflow/${role}.toml"`,
      ...((contract.nickname_candidates || []).length > 0
        ? [`nickname_candidates = ${tomlArray(contract.nickname_candidates)}`] : []),
    ].join('\n');
  }).join('\n\n') + '\n';
}

function manifestFor(profiles) {
  return {
    schema_version: 1,
    behavior_source: BEHAVIOR_SOURCE,
    adapter_source: ADAPTER_SOURCE,
    provenance_source: PROVENANCE_SOURCE,
    roles: [...ROLES],
    runtimes: [...RUNTIMES],
    profiles: profiles.map(profile => ({
      runtime: profile.runtime,
      variant: profile.variant,
      role: profile.role,
      path: profile.path,
      behavior_contract_version: profile.behavior_contract_version,
      behavior_sha256: profile.behavior_sha256,
      resolved_profile_sha256: profile.resolved_profile_sha256,
    })),
  };
}

function expected(root = ROOT) {
  loadProvenance(root);
  const behaviorSource = loadBehaviorContracts(root);
  const profiles = renderProfiles(behaviorSource, loadRuntimeAdapters(root));
  return {
    profiles,
    manifest: JSON.stringify(manifestFor(profiles), null, 2) + '\n',
    codexConfig: renderCodexConfig(behaviorSource),
  };
}

function checkGeneratedProfiles(root = ROOT) {
  const output = expected(root);
  const drift = [];
  for (const profile of trackedProfiles(output.profiles)) {
    const absolute = path.join(root, profile.path);
    const actual = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
    if (actual !== profile.content) drift.push(profile.path);
  }
  const manifestPath = path.join(root, MANIFEST_PATH);
  const actualManifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
  if (actualManifest !== output.manifest) drift.push(MANIFEST_PATH);
  for (const configPath of CODEX_CONFIG_PATHS) {
    const absolute = path.join(root, configPath);
    const actual = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
    if (actual !== output.codexConfig) drift.push(configPath);
  }
  return drift;
}

function writeGeneratedProfiles(root = ROOT) {
  const output = expected(root);
  for (const profile of trackedProfiles(output.profiles)) {
    const absolute = path.join(root, profile.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, profile.content);
  }
  fs.writeFileSync(path.join(root, MANIFEST_PATH), output.manifest);
  for (const configPath of CODEX_CONFIG_PATHS) {
    fs.mkdirSync(path.dirname(path.join(root, configPath)), { recursive: true });
    fs.writeFileSync(path.join(root, configPath), output.codexConfig);
  }
  return output.profiles;
}

function renderRuntimeRole(runtime, role, root = ROOT) {
  if (!RUNTIMES.includes(runtime)) throw new Error('unknown runtime ' + runtime);
  if (!ROLES.includes(role)) throw new Error('unknown role ' + role);
  return renderProfiles(loadBehaviorContracts(root), loadRuntimeAdapters(root))
    .find(profile => profile.runtime === runtime && profile.role === role);
}

function main(argv) {
  const mode = argv[2];
  if (!['--check', '--write', '--print-manifest'].includes(mode)) {
    console.error('usage: node scripts/generate-agent-profiles.js --check|--write|--print-manifest');
    process.exit(2);
  }
  if (mode === '--write') {
    const profiles = writeGeneratedProfiles(ROOT);
    console.log('generated ' + profiles.length + ' native role profiles across seven runtimes');
    return;
  }
  const output = expected(ROOT);
  if (mode === '--print-manifest') {
    process.stdout.write(output.manifest);
    return;
  }
  const drift = checkGeneratedProfiles(ROOT);
  if (drift.length > 0) {
    console.error('agent profile drift:\n' + drift.map(file => '- ' + file).join('\n'));
    process.exit(1);
  }
  console.log('agent profiles current: 14 roles, seven runtimes, 126 native renders');
}

module.exports = {
  ADAPTER_SOURCE,
  BEHAVIOR_SOURCE,
  ROLES,
  RUNTIMES,
  ZERO_HASH,
  RETIRED_VOCABULARY_BAN,
  sha256,
  normalizeResolvedProfileHash,
  behaviorIdentityFromCore,
  verifyResolvedProfileHash,
  loadBehaviorContracts,
  loadRuntimeAdapters,
  loadProvenance,
  renderProfiles,
  renderRuntimeRole,
  rolesByIntent,
  renderRuntimeDelegationGuidance,
  renderRuntimeDelegationGuidanceForRuntime,
  replaceRuntimeDelegationGuidance,
  runtimeAdapter,
  DELEGATION_GUIDANCE_START,
  DELEGATION_GUIDANCE_END,
  checkGeneratedProfiles,
  writeGeneratedProfiles,
  validateBehaviorContracts,
  validateRuntimeAdapters,
  renderCodexConfig,
};

if (require.main === module) main(process.argv);
