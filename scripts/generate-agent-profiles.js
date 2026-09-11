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
// #29 audit: DEFAULT_AGENT_MODELS in kaola-workflow-resolve-agent-model.js is a GENERATED block —
// the SAME derivation (behavior-contracts intent_class -> runtime-capabilities claude
// intent_mapping) that writes each agents/<role>.md `model:` frontmatter line, so the two can never
// independently drift. The resolver itself stays require()-free of this generator and of
// templates/agents (installed runtimes have no schema sibling on disk); only `--write`/`--check`
// here ever read the marked region. Canonical target only — edition-sync.js propagates the write to
// the other 3 byte-identical resolver-module-copies trees (it is not itself a template/render).
const RESOLVER_MODELS_PATH = 'scripts/kaola-workflow-resolve-agent-model.js';
const RESOLVER_MODELS_START = '// GENERATED: DEFAULT_AGENT_MODELS (do not edit; source: templates/agents)';
const RESOLVER_MODELS_END = '// END GENERATED';
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
const RUNTIMES = Object.freeze(['claude', 'codex', 'opencode', 'kimi', 'grok', 'cursor', 'zcode', 'devin']);
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
    if (adapter.runtime === 'devin') {
      const caps = adapter.capabilities;
      if (typeof caps.nesting !== 'number'
          || typeof caps.hot_reload !== 'boolean'
          || typeof caps.rules_survive_compaction !== 'boolean') {
        throw new Error('runtime-capabilities: Devin explicit capability fields missing');
      }
      const compact = adapter.compact_protocol;
      if (!compact || !Array.isArray(compact.events)
          || !compact.events.includes('UserPromptSubmit')) {
        throw new Error('runtime-capabilities: Devin compact protocol must use UserPromptSubmit');
      }
    }
  }
  if (JSON.stringify([...runtimeSet].sort()) !== JSON.stringify([...RUNTIMES].sort())) {
    throw new Error('runtime-capabilities: expected all eight runtime families');
  }
  if (adapterEntries(source).filter(entry => entry.adapter.runtime === 'codex').length !== 3) {
    throw new Error('runtime-capabilities: expected three forge-neutral Codex adapters');
  }
}

function validateProvenance(source) {
  if (!source || source.schema_version !== 2 || !source.origins || !source.roles) {
    throw new Error('provenance: schema_version 2, origins, and roles are required');
  }
  for (const role of ROLES) {
    const record = source.roles[role];
    if (!record || record.source_kind !== 'kaola_authored') {
      throw new Error('provenance: missing role ' + role);
    }
    // A role may carry a historical origin record; it describes where an EARLIER contract came
    // from, never the current one, so it must be complete enough to locate that material.
    if (record.history) {
      for (const field of ['origin', 'upstream_path', 'source_commit', 'source_blob_sha', 'source_sha256', 'retired_by']) {
        if (!record.history[field]) throw new Error('provenance: ' + role + ' history missing ' + field);
      }
      if (!source.origins[record.history.origin]) {
        throw new Error('provenance: ' + role + ' history names unknown origin ' + record.history.origin);
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

function runtimeHostName(runtime) {
  return runtime.charAt(0).toUpperCase() + runtime.slice(1);
}

function runtimeHostGuard(runtime) {
  const host = runtimeHostName(runtime);
  return 'Host: ' + host + '. If the running host is not ' + host
    + ', ignore this adapter section entirely and use the Kaola adapter installed for the actual host;'
    + ' if none is installed, record `capability_gap: no Kaola adapter for host <name>` and work inline.';
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
    runtimeHostGuard(adapter.runtime),
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
  if (runtime === 'devin') {
    const tools = ['read', 'grep', 'glob'];
    if (required.has('scoped_write')) tools.push('edit', 'write');
    if (required.has('command_execution')) tools.push('exec');
    if (required.has('external_research')) tools.push('web_search', 'webfetch');
    return tools;
  }
  const tools = ['Read', 'Grep', 'Glob'];
  if (required.has('scoped_write')) tools.splice(1, 0, 'Write', 'Edit');
  if (required.has('command_execution')) tools.push('Bash');
  if (required.has('external_research')) {
    tools.push('WebSearch', runtime === 'kimi' ? 'FetchURL' : 'WebFetch');
  }
  return tools;
}

function runtimeAppendix(runtime, adapter, contract, behaviorSha) {
  const lines = ['<!-- runtime-adapter:start -->', 'runtime: ' + runtime];
  // Claude alone already carries behavior_contract_version/hash and resolved_profile_hash as
  // machine-readable YAML frontmatter (markdownFrontmatter, `runtime === 'claude'` branch);
  // no installer, preflight, or test reads a second copy from this prose appendix, and nothing
  // reads adapter_capabilities_hash for Claude at all (that field's only real consumer is the
  // Codex preflight/installer, which has no frontmatter and needs it here). Repeating hashes a
  // model does not need to interpret was audit item "同根因补充" (hash appendix carrier); every
  // other runtime keeps the full block below because the appendix is its only machine carrier.
  if (runtime !== 'claude') {
    const capabilitySha = adapterHash(adapter);
    lines.push(
      'behavior_contract_version: ' + contract.behavior_contract_version,
      'behavior_contract_hash: ' + behaviorSha,
      'adapter_capabilities_hash: ' + capabilitySha,
      'resolved_profile_hash: ' + ZERO_HASH,
    );
  }
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
  } else if (runtime === 'devin') {
    lines.push('allowed-tools: ' + JSON.stringify(nativeTools(contract, runtime)));
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

// The Claude dispatch tier for every role: behavior-contracts' declared `intent_class`
// (standard/reasoning/heavy) resolved through runtime-capabilities' claude `intent_mapping`
// (standard->sonnet, reasoning->opus, heavy->fable) — the identical two-step lookup
// `markdownFrontmatter` uses above to write each agents/<role>.md `model:` line.
function defaultAgentModelsMap(behaviorSource = loadBehaviorContracts(), adapterSource = loadRuntimeAdapters()) {
  const intentMapping = adapterSource.runtimes.claude.capabilities.intent_mapping;
  const out = {};
  for (const role of [...ROLES].sort()) {
    out[role] = intentMapping[behaviorSource.roles[role].intent_class];
  }
  return out;
}

function renderDefaultAgentModelsBlock(behaviorSource = loadBehaviorContracts(), adapterSource = loadRuntimeAdapters()) {
  const map = defaultAgentModelsMap(behaviorSource, adapterSource);
  const entries = Object.entries(map);
  const body = entries.map(([role, model], index) => {
    const comma = index === entries.length - 1 ? '' : ',';
    return `  '${role}': '${model}'${comma}`;
  }).join('\n');
  return [
    RESOLVER_MODELS_START,
    'const DEFAULT_AGENT_MODELS = {',
    body,
    '};',
    RESOLVER_MODELS_END,
  ].join('\n');
}

function resolverModelsMarkerRange(fileText) {
  const startIdx = fileText.indexOf(RESOLVER_MODELS_START);
  const endIdx = fileText.indexOf(RESOLVER_MODELS_END);
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return null;
  return { startIdx, endIdx: endIdx + RESOLVER_MODELS_END.length };
}

function checkResolverModels(root = ROOT) {
  const filePath = path.join(root, RESOLVER_MODELS_PATH);
  const actual = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  const expectedBlock = renderDefaultAgentModelsBlock(loadBehaviorContracts(root), loadRuntimeAdapters(root));
  if (actual === null) return { ok: false, path: RESOLVER_MODELS_PATH };
  const range = resolverModelsMarkerRange(actual);
  if (!range) return { ok: false, path: RESOLVER_MODELS_PATH };
  const currentBlock = actual.slice(range.startIdx, range.endIdx);
  return { ok: currentBlock === expectedBlock, path: RESOLVER_MODELS_PATH };
}

function writeResolverModels(root = ROOT) {
  const filePath = path.join(root, RESOLVER_MODELS_PATH);
  const actual = fs.readFileSync(filePath, 'utf8');
  const range = resolverModelsMarkerRange(actual);
  if (!range) {
    throw new Error('resolver_models_markers_missing: ' + RESOLVER_MODELS_PATH);
  }
  const expectedBlock = renderDefaultAgentModelsBlock(loadBehaviorContracts(root), loadRuntimeAdapters(root));
  const next = actual.slice(0, range.startIdx) + expectedBlock + actual.slice(range.endIdx);
  const changed = next !== actual;
  if (changed) fs.writeFileSync(filePath, next);
  return changed;
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
  if (!checkResolverModels(root).ok) drift.push(RESOLVER_MODELS_PATH);
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
  writeResolverModels(root);
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
    console.log('generated ' + profiles.length + ' native role profiles across eight runtimes');
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
  console.log('agent profiles current: 14 roles, eight runtimes, 140 native renders');
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
  defaultAgentModelsMap,
  renderDefaultAgentModelsBlock,
  checkResolverModels,
  writeResolverModels,
  RESOLVER_MODELS_PATH,
  RESOLVER_MODELS_START,
  RESOLVER_MODELS_END,
};

if (require.main === module) main(process.argv);
