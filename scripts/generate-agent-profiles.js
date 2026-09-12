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
// the SAME value (runtime-capabilities claude `subagent_default.model`, the one subagent binding
// every installed Kaola profile pins) that writes each agents/<role>.md `model:` frontmatter line,
// so the two can never independently drift. The resolver itself stays require()-free of this
// generator and of templates/agents (installed runtimes have no schema sibling on disk); only
// `--write`/`--check` here ever read the marked region. Canonical target only — edition-sync.js
// propagates the write to the other 3 byte-identical resolver-module-copies trees (it is not
// itself a template/render).
const RESOLVER_MODELS_PATH = 'scripts/kaola-workflow-resolve-agent-model.js';
const RESOLVER_MODELS_START = '// GENERATED: DEFAULT_AGENT_MODELS (do not edit; source: templates/agents)';
const RESOLVER_MODELS_END = '// END GENERATED';
const ROLES = Object.freeze([
  'code-explorer',
  'code-reviewer',
  'doc-updater',
  'implementer',
  'investigator',
  'knowledge-lookup',
  'tdd-guide',
]);
const RUNTIMES = Object.freeze(['claude', 'codex', 'opencode', 'kimi', 'grok', 'cursor', 'zcode', 'devin']);
// Adapters that still install Kaola role profiles and therefore render one subagent binding each.
const BINDING_RUNTIMES = Object.freeze(['claude', 'codex', 'grok', 'cursor']);
const REQUIRED_COVERAGE = Object.freeze([
  'purpose', 'inputs', 'authority_custody', 'writes', 'deliverable', 'verification', 'stop_conditions',
]);
const REQUIRED_CAPABILITIES = Object.freeze([
  'capability_gap',
  'instruction_loading',
  'role_dispatch',
  'hook_scope',
  'delegation_guidance',
]);
const BINDING_CAPABILITIES = Object.freeze([
  'named_roles',
  'deterministic_profiles',
  'profile_format',
  'model_carrier',
  'tool_binding',
  'subagent_default',
]);
const BINDING_GUIDANCE_KEYS = Object.freeze([
  'profile_lookup', 'dispatch_carrier', 'tool_boundary', 'native_routes', 'availability',
]);
const NATIVE_ONLY_FORBIDDEN_CAPABILITIES = Object.freeze([
  'subagent_default', 'intent_mapping', 'model_carrier', 'profile_format', 'tool_binding',
]);
const NATIVE_ONLY_GUIDANCE_KEYS = Object.freeze(['native_routes', 'availability']);
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
    if (Object.prototype.hasOwnProperty.call(contract, 'intent_class')) {
      throw new Error('behavior-contracts: intent_class retired by #1062');
    }
    if (!Number.isInteger(contract.behavior_contract_version)
        || !contract.description || !contract.body) {
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
    const dispatch = adapter.capabilities.role_dispatch;
    const guidance = adapter.capabilities.delegation_guidance;
    if (dispatch === 'named_profile') {
      if (BINDING_CAPABILITIES.some(key =>
        !Object.prototype.hasOwnProperty.call(adapter.capabilities, key))) {
        throw new Error('runtime-capabilities: incomplete binding capabilities for ' + name);
      }
      const subagentDefault = adapter.capabilities.subagent_default;
      if (!subagentDefault || typeof subagentDefault !== 'object'
          || typeof subagentDefault.model !== 'string' || !subagentDefault.model.trim()
          || typeof subagentDefault.summary !== 'string' || !subagentDefault.summary.trim()
          || (subagentDefault.effort !== undefined
            && (typeof subagentDefault.effort !== 'string' || !subagentDefault.effort.trim()))) {
        throw new Error('runtime-capabilities: incomplete subagent_default for ' + name);
      }
      if (!guidance || BINDING_GUIDANCE_KEYS.some(key => typeof guidance[key] !== 'string')) {
        throw new Error('runtime-capabilities: incomplete delegation guidance for ' + name);
      }
    } else if (dispatch === 'native_only') {
      if (NATIVE_ONLY_FORBIDDEN_CAPABILITIES.some(key =>
        Object.prototype.hasOwnProperty.call(adapter.capabilities, key))) {
        throw new Error('runtime-capabilities: binding-only capability present on native_only ' + name);
      }
      if (!guidance
          || JSON.stringify(Object.keys(guidance).sort())
            !== JSON.stringify([...NATIVE_ONLY_GUIDANCE_KEYS].sort())
          || NATIVE_ONLY_GUIDANCE_KEYS.some(key => typeof guidance[key] !== 'string')) {
        throw new Error('runtime-capabilities: native_only delegation guidance must be exactly native_routes and availability for ' + name);
      }
    } else {
      throw new Error('runtime-capabilities: unknown role_dispatch for ' + name);
    }
    if (adapter.runtime === 'cursor') {
      const conformance = adapter.capabilities.dispatch_conformance;
      if (!conformance
          || conformance.call_shape !== 'Task with flat subagent_type'
          || conformance.named_model_field !== 'omit'
          || conformance.exact_binding !== 'post_resolution_assertion'
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

function isBindingAdapter(adapter) {
  return !!(adapter && adapter.capabilities
    && adapter.capabilities.role_dispatch === 'named_profile');
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
  if (!isBindingAdapter(adapter)) {
    return [
      DELEGATION_GUIDANCE_START,
      '## Runtime adapter facts',
      '',
      runtimeHostGuard(adapter.runtime),
      '',
      'This runtime installs no Kaola role profiles by design; the absence of a named Kaola role'
        + ' is not a `capability_gap`. Choose a native route or work inline per item, as the'
        + ' dispatch contract directs.',
      '',
      guidance.native_routes,
      guidance.availability,
      DELEGATION_GUIDANCE_END,
    ].join('\n');
  }
  const subagentDefault = adapter.capabilities.subagent_default;
  const lines = [
    DELEGATION_GUIDANCE_START,
    '## Runtime adapter facts',
    '',
    runtimeHostGuard(adapter.runtime),
    '',
    guidance.profile_lookup,
    guidance.dispatch_carrier,
    '',
    '**Subagent default:** ' + subagentDefault.summary + '.',
    '**Roles:** ' + ROLES.map(role => '`' + role + '`').join(', ') + '.',
    '',
    guidance.tool_boundary,
    guidance.native_routes,
    guidance.availability,
  ];
  if (guidance.fallback_search) lines.push('', guidance.fallback_search);
  lines.push(DELEGATION_GUIDANCE_END);
  return lines.join('\n');
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
    tools.push('WebSearch', 'WebFetch');
  }
  return tools;
}

function markdownFrontmatter(runtime, role, contract, adapter) {
  const subagentDefault = adapter.capabilities.subagent_default;
  const lines = [
    '---',
    'name: ' + role,
    'description: ' + yamlScalar(contract.description),
  ];
  if (runtime === 'claude') {
    if ((contract.nickname_candidates || []).length > 0) {
      lines.push('nickname_candidates: ' + JSON.stringify(contract.nickname_candidates));
    }
    lines.push('tools: ' + JSON.stringify(nativeTools(contract, runtime)));
    lines.push('model: ' + subagentDefault.model);
  } else if (runtime === 'grok') {
    lines.push('promptMode: full');
    lines.push('model: ' + subagentDefault.model);
    lines.push('effort: ' + subagentDefault.effort);
    lines.push('agentsMd: true');
    lines.push('tools: ' + JSON.stringify(nativeTools(contract, runtime)));
  } else if (runtime === 'cursor') {
    lines.push('model: ' + subagentDefault.model + '[effort=' + subagentDefault.effort + ']');
    lines.push('readonly: ' + (contract.capability_requirements.includes('scoped_write') ? 'false' : 'true'));
  }
  lines.push('---', '');
  return lines.join('\n');
}

function renderMarkdown(runtime, role, contract, adapter) {
  return markdownFrontmatter(runtime, role, contract, adapter)
    + '<!-- kaola-workflow-managed-agent: true -->\n\n'
    + contract.body.trim() + '\n';
}

function tomlArray(values) {
  return '[' + values.map(value => JSON.stringify(String(value))).join(', ') + ']';
}

function renderCodex(role, contract, adapter) {
  const subagentDefault = adapter.capabilities.subagent_default;
  const developerInstructions = contract.body.trim();
  if (developerInstructions.includes("'''")) throw new Error(role + ': TOML literal delimiter in behavior');
  return [
    'name = ' + JSON.stringify(role),
    'description = ' + JSON.stringify(contract.description),
    ...((contract.nickname_candidates || []).length > 0
      ? ['nickname_candidates = ' + tomlArray(contract.nickname_candidates)] : []),
    'model = ' + JSON.stringify(subagentDefault.model),
    'model_reasoning_effort = ' + JSON.stringify(subagentDefault.effort),
    "developer_instructions = '''",
    developerInstructions,
    "'''",
    '',
  ].join('\n');
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
    if (!isBindingAdapter(adapter)) continue;
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
        adapter_capabilities_sha256: adapterHash(adapter),
        resolved_profile_sha256: sha256(content),
        content,
      });
    }
  }
  return profiles;
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
  const core = contract.body.trim();
  if (!String(content).includes(core)) {
    throw new Error('behavior_contract_core_mismatch: ' + role);
  }
  return {
    role,
    behavior_contract_version: contract.behavior_contract_version,
    behavior_contract_hash: behaviorHash(contract),
    core,
  };
}

function manifestProfileEntry(runtime, role, root = ROOT, variant = runtime === 'codex' ? 'codex-github' : runtime) {
  const manifest = readJson(root, MANIFEST_PATH);
  const entry = (manifest.profiles || []).find(profile =>
    profile.runtime === runtime && profile.variant === variant && profile.role === role);
  if (!entry) {
    throw new Error('manifest_profile_entry_missing: ' + runtime + '/' + variant + '/' + role);
  }
  return entry;
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
    runtimes: [...BINDING_RUNTIMES],
    native_only_runtimes: RUNTIMES.filter(runtime => !BINDING_RUNTIMES.includes(runtime)),
    profiles: profiles.map(profile => ({
      runtime: profile.runtime,
      variant: profile.variant,
      role: profile.role,
      path: profile.path,
      behavior_contract_version: profile.behavior_contract_version,
      behavior_sha256: profile.behavior_sha256,
      adapter_capabilities_sha256: profile.adapter_capabilities_sha256,
      resolved_profile_sha256: profile.resolved_profile_sha256,
    })),
  };
}

// The Claude subagent binding for every role: runtime-capabilities' claude `subagent_default.model`
// — the identical value `markdownFrontmatter` uses above to write each agents/<role>.md `model:`
// line. One binding covers the whole roster; there is no per-role class.
function defaultAgentModelsMap(behaviorSource = loadBehaviorContracts(), adapterSource = loadRuntimeAdapters()) {
  const model = adapterSource.runtimes.claude.capabilities.subagent_default.model;
  const out = {};
  for (const role of [...ROLES].sort()) {
    out[role] = model;
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
  if (!BINDING_RUNTIMES.includes(runtime)) {
    throw new Error('runtime ' + runtime + ' is native_only and installs no Kaola role profiles');
  }
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
    console.log('generated ' + profiles.length + ' native role profiles across six adapters');
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
  console.log('agent profiles current: 7 roles, four runtimes (six adapters), 42 native renders');
}

module.exports = {
  ADAPTER_SOURCE,
  BEHAVIOR_SOURCE,
  ROLES,
  RUNTIMES,
  BINDING_RUNTIMES,
  isBindingAdapter,
  RETIRED_VOCABULARY_BAN,
  sha256,
  adapterHash,
  MANIFEST_PATH,
  manifestProfileEntry,
  behaviorIdentityFromCore,
  loadBehaviorContracts,
  loadRuntimeAdapters,
  loadProvenance,
  renderProfiles,
  renderRuntimeRole,
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
